import { describe, expect, it } from 'vitest';
import {
  buildActivityGrid,
  countDailyGoals,
  createEmptyDailyActivity,
  describeActivityCell,
  getActivityLevel,
  getCurrentDailyStreak,
  getCurrentWeeklyStreak,
  getVolumeCuts,
  meetsTwoGoals,
  type DailyActivity,
} from './activityGrid';

const day = (overrides: Partial<DailyActivity>): DailyActivity => ({ ...createEmptyDailyActivity(), ...overrides });

// Miércoles 28 de octubre de 2026.
const TODAY = '2026-10-28';

describe('niveles', () => {
  it('cuenta las cuatro metas del día', () => {
    expect(countDailyGoals(null)).toBe(0);
    expect(countDailyGoals(day({ sessions: 1, steps: 8000, sleepMinutes: 420, activeKcal: 450 }))).toBe(4);
    expect(countDailyGoals(day({ steps: 7999, sleepMinutes: 419, activeKcal: 449 }))).toBe(0);
  });

  it('gradúa los pasos en cuatro niveles', () => {
    expect(getActivityLevel(day({ steps: 1999 }), 'pasos')).toBe(0);
    expect(getActivityLevel(day({ steps: 2000 }), 'pasos')).toBe(1);
    expect(getActivityLevel(day({ steps: 6000 }), 'pasos')).toBe(2);
    expect(getActivityLevel(day({ steps: 9000 }), 'pasos')).toBe(3);
    expect(getActivityLevel(day({ steps: 12000 }), 'pasos')).toBe(4);
  });

  it('usa la duración cuando la sesión no registra carga', () => {
    expect(getActivityLevel(day({ sessions: 1, minutes: 30 }), 'entreno')).toBe(1);
    expect(getActivityLevel(day({ sessions: 1, minutes: 50 }), 'entreno')).toBe(2);
    expect(getActivityLevel(day({ sessions: 0, volumeKg: 9000 }), 'entreno')).toBe(0);
  });

  it('ajusta los cortes de volumen al historial de la persona', () => {
    const light = [2000, 2500, 3000, 3500].map((volumeKg) => day({ sessions: 1, volumeKg }));
    const cuts = getVolumeCuts(light);
    expect(getActivityLevel(light[0], 'entreno', cuts)).toBe(1);
    expect(getActivityLevel(light[3], 'entreno', cuts)).toBe(4);
    // Con pocas sesiones se quedan los cortes fijos.
    expect(getVolumeCuts(light.slice(0, 2))).toEqual([5600, 7200, 9000]);
  });
});

describe('buildActivityGrid', () => {
  it('arma semanas de lunes a domingo que terminan en la semana de hoy', () => {
    const model = buildActivityGrid({ todayKey: TODAY, weeks: 16, days: {}, mode: 'todo' });

    expect(model.cells).toHaveLength(112);
    expect(model.cells[0].dateKey).toBe('2026-07-13');
    expect(model.cells[0].dayIndex).toBe(0);
    expect(model.cells[111].dateKey).toBe('2026-11-01');
    expect(model.todayIndex).toBe(15 * 7 + 2);
    expect(model.cells[model.todayIndex].isToday).toBe(true);
    expect(model.cells[model.todayIndex + 1].isFuture).toBe(true);
    expect(model.months.map((month) => month.label)).toEqual(['jul', 'ago', 'sep', 'oct']);
  });

  it('atenúa los días antes del primer dato', () => {
    const model = buildActivityGrid({
      todayKey: TODAY,
      weeks: 2,
      days: { '2026-10-27': day({ sessions: 1 }) },
      mode: 'todo',
      startKey: '2026-10-26',
    });

    expect(model.cells[6].isBeforeStart).toBe(true);
    expect(model.cells[7].isBeforeStart).toBe(false);
    expect(model.cells[8].level).toBe(1);
  });
});

describe('rachas', () => {
  it('cuenta desde ayer mientras hoy todavía no cumple', () => {
    const days = {
      '2026-10-25': day({ sessions: 1, steps: 9000 }),
      '2026-10-26': day({ sessions: 1, steps: 9000 }),
      '2026-10-27': day({ sessions: 1, sleepMinutes: 480 }),
      '2026-10-28': day({ steps: 3000 }),
    };
    const model = buildActivityGrid({ todayKey: TODAY, weeks: 2, days, mode: 'todo' });

    expect(getCurrentDailyStreak(model.cells, model.todayIndex, meetsTwoGoals)).toBe(3);
  });

  it('no corta la racha semanal por la semana en curso', () => {
    const days: Record<string, DailyActivity> = {};
    // Semanas completas del 12 y del 19 de octubre con 3 sesiones; la actual lleva 1.
    for (const key of ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26']) {
      days[key] = day({ sessions: 1 });
    }
    const model = buildActivityGrid({ todayKey: TODAY, weeks: 4, days, mode: 'entreno' });

    expect(getCurrentWeeklyStreak(model)).toBe(2);
  });
});

describe('describeActivityCell', () => {
  it('resume el entreno del día', () => {
    const model = buildActivityGrid({
      todayKey: TODAY,
      weeks: 1,
      days: { '2026-10-27': day({ sessions: 1, minutes: 58, volumeKg: 8900, trainingNames: ['Pull A'] }) },
      mode: 'entreno',
    });
    const detail = describeActivityCell(model.cells[1]);

    expect(detail.title).toBe('Martes 27 de octubre');
    expect(detail.rows[0].value).toBe('Pull A · 58 min · 8.9 t');
    expect(describeActivityCell(model.cells[2]).badge).toBe('Hoy');
  });
});
