import { describe, expect, it } from 'vitest';
import { planSegments, planSegmentsForMonth } from './planner';

const lens = (days: number) => planSegments(days).map((s) => s.len);

describe('planSegments', () => {
  it('段数按向下取整：≤13→1, 14–20→2, 21–27→3, ≥28→4', () => {
    expect(planSegments(6).length).toBe(1);
    expect(planSegments(13).length).toBe(1);
    expect(planSegments(14).length).toBe(2);
    expect(planSegments(20).length).toBe(2);
    expect(planSegments(21).length).toBe(3);
    expect(planSegments(27).length).toBe(3);
    expect(planSegments(28).length).toBe(4);
    expect(planSegments(31).length).toBe(4);
  });

  it('段内均分，余数并入最后一段', () => {
    expect(lens(6)).toEqual([6]);
    expect(lens(13)).toEqual([13]);
    expect(lens(14)).toEqual([7, 7]);
    expect(lens(15)).toEqual([7, 8]);
    expect(lens(20)).toEqual([10, 10]);
    expect(lens(21)).toEqual([7, 7, 7]);
    expect(lens(27)).toEqual([9, 9, 9]);
    expect(lens(28)).toEqual([7, 7, 7, 7]);
    expect(lens(31)).toEqual([7, 7, 7, 10]);
  });

  it('段区间连续且覆盖全部天数，不重不漏', () => {
    for (const days of [1, 6, 7, 13, 14, 15, 20, 21, 27, 28, 29, 30, 31]) {
      const segs = planSegments(days);
      expect(segs[0].fromDay).toBe(1);
      expect(segs[segs.length - 1].toDay).toBe(days);
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i].fromDay).toBe(segs[i - 1].toDay + 1);
      }
      expect(segs.reduce((a, s) => a + s.len, 0)).toBe(days);
    }
  });

  it('days <= 0 返回空数组', () => {
    expect(planSegments(0)).toEqual([]);
    expect(planSegments(-3)).toEqual([]);
  });

  it('月份映射出正确的日期范围', () => {
    const feb = planSegmentsForMonth('2026-02', 28);
    expect(feb.length).toBe(4);
    expect(feb[0].from).toBe('2026-02-01');
    expect(feb[3].to).toBe('2026-02-28');

    const partial = planSegmentsForMonth('2026-09', 15);
    expect(partial.map((s) => `${s.from}~${s.to}`)).toEqual([
      '2026-09-01~2026-09-07',
      '2026-09-08~2026-09-15',
    ]);
  });
});
