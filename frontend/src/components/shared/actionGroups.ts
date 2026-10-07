import type { MobileAction } from './ActionsMenu';

/** `actions` as non-empty groups, whether the caller gave a flat list or groups. */
export function toGroups(actions: MobileAction[] | MobileAction[][]): MobileAction[][] {
  const groups = isGrouped(actions) ? actions : [actions];
  return groups.filter(group => group.length > 0);
}

function isGrouped(actions: MobileAction[] | MobileAction[][]): actions is MobileAction[][] {
  return actions.length > 0 && Array.isArray(actions[0]);
}
