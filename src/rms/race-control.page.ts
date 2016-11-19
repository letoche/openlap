import { Component, Input, OnDestroy, OnInit } from '@angular/core';

import { NavParams } from 'ionic-angular';

import { ControlUnit } from '../carrera';
import { CONTROL_UNIT_PROVIDER, Settings, Speech } from '../core';
import { Logger } from '../logging';

import { LeaderboardItem } from './leaderboard.component';
import { RaceSession } from './race-session';

import { Observable, Subscription } from 'rxjs';
import 'rxjs/observable/fromEvent';

const FIELDS = {
  'practice': [
    ['position', 'code', 'bestlap', 'gap', 'int', 'laptime', 'laps', 'status'],
    ['position', 'number', 'name', 'bestlap', 'gap', 'int', 'laptime', 'laps', 'status'],
    ['position', 'code', 'bestlap', 'gap', 'int', 'laptime', 'laps', 'fuel', 'status'],
    ['position', 'number', 'name', 'bestlap', 'gap', 'int', 'laptime', 'laps', 'fuel', 'status']
  ],
  'qualifying': [
    ['position', 'code', 'bestlap', 'gap', 'int', 'laptime', 'laps', 'status'],
    ['position', 'number', 'name', 'bestlap', 'gap', 'int', 'laptime', 'laps', 'status'],
    ['position', 'code', 'bestlap', 'gap', 'int', 'laptime', 'laps', 'fuel', 'status'],
    ['position', 'number', 'name', 'bestlap', 'gap', 'int', 'laptime', 'laps', 'fuel', 'status']
  ],
  'race': [
    ['position', 'code', 'time', 'bestlap', 'laptime', 'laps', 'status'],
    ['position', 'number', 'name', 'time', 'bestlap', 'laptime', 'laps', 'status'],
    ['position', 'code', 'time', 'bestlap', 'laptime', 'laps', 'pits', 'fuel', 'status'],
    ['position', 'number', 'name', 'time', 'bestlap', 'laptime', 'laps', 'pits', 'fuel', 'status']
  ]
};

@Component({
  selector: 'lap',
  template: '{{value[0]}}<span *ngIf="value[1]">/{{value[1]}}</span>'
})
export class Lap {
  @Input() value: [number, number];
}

@Component({
  providers: [CONTROL_UNIT_PROVIDER],
  templateUrl: 'race-control.page.html',
})
export class RaceControlPage implements OnDestroy, OnInit {

  options: any;

  fields: Observable<string[]>;

  start: Observable<number>;
  blink: Observable<boolean>;
  timer: Observable<number>;

  session: RaceSession;

  ranking: Observable<LeaderboardItem[]>;

  private subscription: Subscription;

  constructor(public cu: ControlUnit, private logger: Logger, private settings: Settings, private speech: Speech, 
    params: NavParams) 
  {
    this.logger.info('Main page', cu, params.data);
    this.options = params.data;

    let start = this.cu.getStart();  // TODO: distinctUntilChanged
    let state = this.cu.getState();  // TODO: distinctUntilChanged
    let mode = this.cu.getMode().distinctUntilChanged().do(value => console.log('Mode: ' + value));

    // use "resize" event for easier testing on browsers
    const orientation = Observable.fromEvent(window, 'resize').startWith(undefined).map(() => {
      return window.innerWidth < window.innerHeight ? 'portrait' : 'landscape';
    }).distinctUntilChanged();

    this.fields = mode.startWith(0).combineLatest(orientation).map(([mode, orientation]) => {
      const index = (orientation === 'portrait' ? 0 : 1) + (mode & 0x03 ? 2 : 0);
      return FIELDS[this.options.mode][index];
    });

    this.start = start.map(value => {
      return value == 1 ? 5 : value > 1 && value < 7 ? value - 1 : 0;
    });
    this.blink = state.combineLatest(start, (state, value) => {
      return state !== 'connected' || value >= 8;
    });
  }

  ngOnInit() {
    this.onStart();
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  onStart() {
    const session = this.session = new RaceSession(this.cu, this.options);

    const events = Observable.merge(
      session.grid.map(obs => obs.pairwise()).mergeAll().filter(([prev, curr]) => {
        // TODO: driver finished, driver best lap, ...
        return prev.fuel > curr.fuel && curr.fuel < 3 && !curr.finished;
      }).map(([_prev, curr]) => {
        return ['fuel' + curr.fuel, curr.id];
      }),
      session.bestlap.filter(car => car && car.laps >= 3).map(car => {
        return ['bestlap', car.id];
      }),
      session.lap.filter(([lap, laps]) => lap === laps - 1).map(() => {
        return ['finallap', null];
      }),
      session.finished.distinctUntilChanged().filter(finished => finished).map(() => {
        return ['finished', null];
      }),
      this.start.filter(value => value == 9).map(() => {
        return ['falsestart', null];
      })
    ).withLatestFrom(this.settings.getDrivers()).map(([[event, id], drivers]) => {
      return <[string, any]>[event, id !== null ? drivers[id] : null];
    });

    this.ranking = session.ranking.combineLatest(
      this.settings.getDrivers(),
    ).map(([ranks, drivers]) => {
      return ranks.map(item => {
        return Object.assign({}, item, { driver: drivers[item.id] });
      });
    });

    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    this.subscription = events.withLatestFrom(this.settings.getOptions(), this.settings.getMessages()).subscribe(([[event, driver], options, messages]) => {
      console.log('New race event: ' + event, driver);
      if (options.speech && messages[event]) {
        if (driver && driver.name) {
          this.speech.speak(driver.name + ': ' + messages[event]);
        } else {
          this.speech.speak(messages[event]);
        }
      }
    });

    if (this.options.mode != 'practice') {
      const start = this.cu.getStart();
      start.take(1).toPromise().then(value => {
        if (value === 0) {
          this.cu.toggleStart();
        }
        // wait until startlight goes off; TODO: subscribe/unsibscribe?
        this.cu.getStart().pairwise().filter(([prev, curr]) => {
          return prev != 0 && curr == 0;
        }).take(1).toPromise().then(() => {
          this.logger.info('Start ' + this.options.mode + ' mode');
          session.start();
        });
      });
    }
  }
}