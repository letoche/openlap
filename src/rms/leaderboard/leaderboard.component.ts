import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

const compare = {
  'position': (lhs: LeaderboardItem, rhs: LeaderboardItem) => {
    return lhs.position - rhs.position;
  },
  'number':  (lhs: LeaderboardItem, rhs: LeaderboardItem) => {
    return lhs.id - rhs.id;
  }
};

// FIXME: @Input() with interface not working in Ionic 2 RC1?
export class LeaderboardItem {
  id: number;
  driver: { name: string, code: string, color: string };
  position: number;
  time: number;
  laps: number;
  last: number[];
  best: number[];
  fuel?: number;
  pit?: boolean;
  pits?: number;
  sector?: number;
  finished?: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'leaderboard',
  templateUrl: 'leaderboard.component.html'
})
export class LeaderboardComponent {

  private _items: LeaderboardItem[];

  public ordered: LeaderboardItem[];

  public best: number[];

  @Input() fields: string[];

  @Input() order: 'position' | 'number';

  @Input() set items(items: LeaderboardItem[]) {
    this._items = items;
    if (items) {
      this.ordered = [...items];
      this.ordered.sort(compare[this.order] || compare['position']);
      this.best = items.map(item => item.best).reduce((acc, times) => {
        times.forEach((time, index) => {
          if (time < (acc[index] || Infinity)) {
            acc[index] = time;
          }
        });
        return acc;
      }, []);
    } else {
      this.ordered = items;
      this.best = [];
    }
  }

  get items() {
    return this._items;
  }

  ngOnInit() {
    console.log('Creating leaderboard');
  }
}
