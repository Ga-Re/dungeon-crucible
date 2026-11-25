import type { MessageKey } from '../i18n/en';
import type { IconName } from '../ui/Icon';
import type { ToolId, WorkspaceId } from './store';

/** A ribbon button either selects a tool or runs a command; toggles show an active state. */
export interface RibbonButton {
  id: string;
  icon: IconName;
  label: MessageKey;
  tool?: ToolId;
}

export interface RibbonGroup {
  label: MessageKey;
  buttons: RibbonButton[];
}

export interface RibbonTab {
  label: MessageKey;
  groups: RibbonGroup[];
}

export type PanelId =
  | 'map' | 'browser' | 'properties' | 'fog' | 'initiative' | 'preview' | 'table'
  | 'dice' | 'log' | 'encounter' | 'creature' | 'atlas' | 'vault' | 'sound' | 'party';

export interface DefaultLayout {
  center: PanelId;
  left: PanelId[];
  right: PanelId[];
  bottom: PanelId[];
  floating?: { id: PanelId; width: number; height: number }[];
}

export interface WorkspaceDef {
  id: WorkspaceId;
  icon: IconName;
  name: MessageKey;
  desc: MessageKey;
  tabs: RibbonTab[];
  layout: DefaultLayout;
}

const view: RibbonGroup = {
  label: 'group.view',
  buttons: [
    { id: 'tool:select', icon: 'select', label: 'tool.select', tool: 'select' },
    { id: 'tool:pan', icon: 'pan', label: 'tool.pan', tool: 'pan' },
    { id: 'tool:measure', icon: 'measure', label: 'tool.measure', tool: 'measure' },
    { id: 'fit', icon: 'fit', label: 'tool.fit' },
    { id: 'toggle:viewAsPlayer', icon: 'eye', label: 'tool.playerView' },
  ],
};

/** Fog tools as in Dungeon-Manager's Nebel ribbon (T-247) plus a brush. */
const fogTools: RibbonTab = {
  label: 'tab.fog',
  groups: [
    {
      label: 'group.tools',
      buttons: [
        { id: 'tool:fog-rect', icon: 'rect', label: 'tool.fogRect', tool: 'fog-rect' },
        { id: 'tool:fog-ellipse', icon: 'sphere', label: 'tool.fogEllipse', tool: 'fog-ellipse' },
        { id: 'tool:fog-polygon', icon: 'zone', label: 'tool.fogPolygon', tool: 'fog-polygon' },
        { id: 'tool:fog-lasso', icon: 'line', label: 'tool.fogLasso', tool: 'fog-lasso' },
        { id: 'tool:fog-brush', icon: 'brush', label: 'tool.fogBrush', tool: 'fog-brush' },
        { id: 'tool:reveal-room', icon: 'room', label: 'tool.revealRoom', tool: 'reveal-room' },
      ],
    },
    {
      label: 'group.mode',
      buttons: [
        { id: 'fogmode:reveal', icon: 'eye', label: 'fog.reveal' },
        { id: 'fogmode:hide', icon: 'eyeoff', label: 'fog.hide' },
      ],
    },
    {
      label: 'group.state',
      buttons: [
        { id: 'fog:hideAll', icon: 'eyeoff', label: 'tool.hideAll' },
        { id: 'fog:revealAll', icon: 'eye', label: 'tool.revealAll' },
        { id: 'fog:dmHide', icon: 'fog', label: 'tool.fogHideDm' },
        { id: 'panel:fog', icon: 'fog', label: 'panel.fog' },
      ],
    },
  ],
};

const tableTab: RibbonTab = {
  label: 'tab.table',
  groups: [
    {
      label: 'group.output',
      buttons: [
        { id: 'table:open', icon: 'monitor', label: 'tool.openTable' },
        { id: 'table:move', icon: 'monmove', label: 'tool.moveMonitor' },
        { id: 'table:rotate', icon: 'rotate', label: 'tool.rotate' },
        { id: 'toggle:blackout', icon: 'blackout', label: 'tool.blackout' },
      ],
    },
    {
      label: 'group.calibration',
      buttons: [{ id: 'panel:table', icon: 'ruler', label: 'tool.physical' }],
    },
  ],
};

export const WORKSPACES: Record<WorkspaceId, WorkspaceDef> = {
  forge: {
    id: 'forge',
    icon: 'anvil',
    name: 'ws.forge',
    desc: 'ws.forge.desc',
    tabs: [
      {
        label: 'tab.map',
        groups: [
          { label: 'group.create', buttons: [{ id: 'map:import', icon: 'import', label: 'tool.importMap' }] },
          { label: 'group.mapData', buttons: [{ id: 'map:settings', icon: 'sliders', label: 'tool.mapSettings' }] },
          {
            label: 'group.grid',
            buttons: [
              { id: 'tool:calibrate', icon: 'calib', label: 'tool.calibrate', tool: 'calibrate' },
              { id: 'toggle:snap', icon: 'magnet', label: 'tool.snap' },
            ],
          },
          view,
        ],
      },
      {
        label: 'tab.zones',
        groups: [{ label: 'group.zones', buttons: [{ id: 'tool:select', icon: 'select', label: 'tool.select', tool: 'select' }, { id: 'tool:zone', icon: 'zone', label: 'tool.zone', tool: 'zone' }] }],
      },
      {
        label: 'tab.walls',
        groups: [
          {
            label: 'group.draw',
            buttons: [
              { id: 'tool:wall', icon: 'wall', label: 'tool.wall', tool: 'wall' },
              { id: 'tool:door', icon: 'door', label: 'tool.door', tool: 'door' },
              { id: 'tool:secret-door', icon: 'secretdoor', label: 'tool.secretDoor', tool: 'secret-door' },
              { id: 'tool:window', icon: 'window', label: 'tool.window', tool: 'window' },
              { id: 'walls:undo', icon: 'undo', label: 'tool.undoWall' },
            ],
          },
          { label: 'group.light', buttons: [{ id: 'tool:light', icon: 'light', label: 'tool.light', tool: 'light' }] },
        ],
      },
      fogTools,
    ],
    layout: { center: 'map', left: ['browser'], right: ['properties', 'fog'], bottom: ['log'] },
  },
  vault: {
    id: 'vault',
    icon: 'box',
    name: 'ws.vault',
    desc: 'ws.vault.desc',
    tabs: [{ label: 'tab.asset', groups: [{ label: 'group.create', buttons: [{ id: 'soon', icon: 'plus', label: 'tool.newCreature' }] }] }],
    layout: { center: 'vault', left: ['browser'], right: [], bottom: [] },
  },
  creatures: {
    id: 'creatures',
    icon: 'token',
    name: 'ws.creatures',
    desc: 'ws.creatures.desc',
    tabs: [
      {
        label: 'tab.creature',
        groups: [
          {
            label: 'group.create',
            buttons: [
              { id: 'creature:newPc', icon: 'users', label: 'tool.newPc' },
              { id: 'creature:new', icon: 'skull', label: 'tool.newCreature' },
            ],
          },
        ],
      },
    ],
    layout: { center: 'creature', left: ['browser'], right: [], bottom: ['dice'] },
  },
  atlas: {
    id: 'atlas',
    icon: 'graph',
    name: 'ws.atlas',
    desc: 'ws.atlas.desc',
    tabs: [{ label: 'tab.planning', groups: [{ label: 'group.tools', buttons: [{ id: 'panel:encounter', icon: 'swords', label: 'panel.encounter' }] }] }],
    layout: { center: 'atlas', left: ['browser'], right: ['encounter'], bottom: [] },
  },
  play: {
    id: 'play',
    icon: 'crown',
    name: 'ws.play',
    desc: 'ws.play.desc',
    tabs: [
      {
        label: 'tab.game',
        groups: [
          view,
          {
            label: 'group.scene',
            buttons: [
              { id: 'toggle:editStart', icon: 'flag', label: 'tool.editStart' },
              { id: 'scene:reset', icon: 'reset', label: 'tool.resetScene' },
              { id: 'party:place', icon: 'users', label: 'tool.placeParty' },
            ],
          },
          {
            label: 'group.combat',
            buttons: [
              { id: 'tool:ping', icon: 'ping', label: 'tool.ping', tool: 'ping' },
              { id: 'turn:next', icon: 'next', label: 'tool.nextTurn' },
              { id: 'toggle:moveLock', icon: 'lock', label: 'tool.moveLock' },
            ],
          },
        ],
      },
      fogTools,
      {
        label: 'tab.spells',
        groups: [
          {
            label: 'group.templates',
            buttons: [
              { id: 'tool:cone', icon: 'cone', label: 'tool.cone', tool: 'cone' },
              { id: 'tool:sphere', icon: 'sphere', label: 'tool.sphere', tool: 'sphere' },
              { id: 'tool:line', icon: 'line', label: 'tool.line', tool: 'line' },
              { id: 'tool:cube', icon: 'cube', label: 'tool.cube', tool: 'cube' },
              { id: 'templates:clear', icon: 'trash', label: 'tool.clearTemplates' },
            ],
          },
        ],
      },
      tableTab,
      {
        label: 'tab.audio',
        groups: [
          {
            label: 'group.audio',
            buttons: [
              { id: 'panel:sound', icon: 'music', label: 'panel.sound' },
              { id: 'audio:stop', icon: 'pause', label: 'audio.stopAll' },
            ],
          },
        ],
      },
    ],
    layout: {
      center: 'map',
      left: ['browser', 'fog'],
      right: ['initiative', 'party', 'table'],
      bottom: ['sound', 'dice', 'log'],
      floating: [{ id: 'preview', width: 360, height: 260 }],
    },
  },
};

export const WORKSPACE_ORDER: WorkspaceId[] = ['forge', 'vault', 'creatures', 'atlas', 'play'];

export const PANEL_TITLES: Record<PanelId, MessageKey> = {
  map: 'panel.map',
  browser: 'panel.browser',
  properties: 'panel.properties',
  fog: 'panel.fog',
  initiative: 'panel.initiative',
  preview: 'panel.preview',
  table: 'panel.table',
  dice: 'panel.dice',
  log: 'panel.log',
  encounter: 'panel.encounter',
  creature: 'panel.creature',
  atlas: 'panel.atlas',
  vault: 'panel.vault',
  sound: 'panel.sound',
  party: 'panel.party',
};
