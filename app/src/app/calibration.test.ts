import { describe, expect, it } from 'vitest';
import {
  cancelCalibration, finishCalibration, moveCalibration, setCalibrationBox, setCalibrationCells, setCalibrationGrid, setTool, setWorkspace, startCalibration, state, undo,
} from './store';

/** The store starts with the sample crypt (70 px cells, browser mode). */
describe('"calibrate grid" command (E-7, DC-021)', () => {
  it('a box over N×N cells previews the grid live; OK saves it as one undoable step', () => {
    setWorkspace('forge');
    const before = { ...state.scene.map.grid };
    startCalibration();
    expect(state.tool).toBe('calibrate');
    expect(state.calibration!.cells).toBe(3);
    setCalibrationBox({ x: 10, y: 20, size: 3 * 60 });
    expect(state.scene.map.grid).toMatchObject({ cellWidth: 60, cellHeight: 60, originX: 10, originY: 20 });
    // Another cell count measures the same box anew.
    setCalibrationCells(4);
    expect(state.scene.map.grid.cellWidth).toBe(45);
    setCalibrationCells(3);
    // Arrow keys: box and grid move together.
    moveCalibration(5, -3);
    expect(state.calibration!.box).toEqual({ x: 15, y: 17, size: 180 });
    expect(state.scene.map.grid).toMatchObject({ originX: 15, originY: 17 });
    expect(finishCalibration()).toBe(true);
    expect(state.calibration).toBeNull();
    expect(state.tool).toBe('select');
    expect(state.scene.map.grid.cellWidth).toBe(60);

    undo();
    expect(state.scene.map.grid).toEqual(before);
  });

  it('number fields set the grid directly; Cancel brings the old grid back', () => {
    setWorkspace('forge');
    const before = { ...state.scene.map.grid };
    startCalibration();
    setCalibrationBox({ x: 0, y: 0, size: 150 });
    setCalibrationGrid({ cellWidth: 52 });
    expect(state.scene.map.grid).toMatchObject({ cellWidth: 52, cellHeight: 52 });
    // The box no longer matches the grid.
    expect(state.calibration!.box).toBeNull();
    setCalibrationGrid({ originX: 7 });
    expect(state.scene.map.grid.originX).toBe(7);
    cancelCalibration();
    expect(state.scene.map.grid).toEqual(before);
    expect(state.calibration).toBeNull();
  });

  it('another tool cancels it; the Orchestrator cannot start it', () => {
    setWorkspace('forge');
    const before = { ...state.scene.map.grid };
    startCalibration();
    setCalibrationBox({ x: 0, y: 0, size: 99 });
    setTool('measure');
    expect(state.calibration).toBeNull();
    expect(state.scene.map.grid).toEqual(before);
    setWorkspace('play');
    startCalibration();
    expect(state.calibration).toBeNull();
  });
});
