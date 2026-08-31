import { describe, expect, it } from 'vitest';
import { AUTHORITY_INVENTORY, COMMAND_AUTHORITY_INVENTORY } from './authorityInventory';
import { INSTANT_COMMAND_CATALOG } from './catalog';

describe('AUTHORITY_INVENTORY', () => {
  it('maps every catalog authority to one canonical seam', () => {
    const authorities = new Set(AUTHORITY_INVENTORY.map((entry) => entry.id));
    for (const command of INSTANT_COMMAND_CATALOG) {
      expect(authorities.has(command.authority), `${command.id} authority`).toBe(true);
    }
  });

  it('does not advertise model routing, downloads, or ad-hoc UI clicking as authority', () => {
    const forbidden = /model routing|download|click|settimeout|network/i;
    for (const authority of AUTHORITY_INVENTORY) {
      expect(`${authority.id} ${authority.canonicalSeam}`).not.toMatch(forbidden);
    }
  });

  it('records one canonical safety/context/test seam for every planned catalog command', () => {
    const plannedIds = `
      page.open page.back page.forward page.home settings.open settings.close
      settings.section.open palette.open launcher.open fullscreen.set
      terminal.open terminal.focus terminal.message terminal.broadcast terminal.split
      terminal.rename terminal.move_project terminal.restart terminal.clear terminal.stop
      terminal.close terminal.list terminal.status terminal.run_saved_command terminal.cancel_queued
      agent.message agent.broadcast agent.open agent.status agent.continue agent.stop
      agent.assign_role agent.give_context
      project.create project.open project.rename project.archive project.list
      chat.create chat.open chat.rename chat.list
      schedule.create schedule.list schedule.open schedule.pause schedule.resume schedule.enable
      schedule.disable schedule.run_now schedule.edit schedule.delete timer.start timer.cancel
      alarm.set alarm.cancel
      setting.read setting.set setting.toggle
      music.play music.pause music.resume music.stop music.next music.previous music.track
      music.volume music.mute music.unmute ambient.set
      tool.open tool.run tool.stop skill.open skill.enable skill.disable plugin.open
      plugin.connect plugin.disconnect plugin.status
      files.open files.search file.reveal file.open context.open context.map.create
      context.map.recenter context.give_terminals
      task.create task.open task.complete task.reopen task.assign workbench.open
      workbench.template workbench.panel.add workbench.wallpaper.set
      workbench.wallpaper.pause workbench.wallpaper.resume
      team.connect team.list team.message team.broadcast team.status
    `
      .trim()
      .split(/\s+/u);
    const inventoryIds = new Set(COMMAND_AUTHORITY_INVENTORY.map((entry) => entry.commandId));
    expect(plannedIds.filter((id) => !inventoryIds.has(id))).toEqual([]);
    expect(INSTANT_COMMAND_CATALOG.filter((entry) => !inventoryIds.has(entry.id))).toEqual([]);
    for (const entry of COMMAND_AUTHORITY_INVENTORY) {
      expect(entry.canonicalSeam).toBeTruthy();
      expect(entry.requiredContext.length).toBeGreaterThan(0);
      expect(entry.testSeam).toMatch(/instant-command|authority|catalog/i);
      expect(['ready', 'blocked', 'capability-gated']).toContain(entry.currentState);
    }
  });
});
