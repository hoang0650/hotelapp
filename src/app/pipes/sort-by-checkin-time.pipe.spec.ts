import { SortByCheckinTimePipe } from './sort-by-checkin-time.pipe';

describe('SortByCheckinTimePipe', () => {
  it('create an instance', () => {
    const pipe = new SortByCheckinTimePipe();
    expect(pipe).toBeTruthy();
  });
});
