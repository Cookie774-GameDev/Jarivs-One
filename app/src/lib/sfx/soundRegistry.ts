export const VIBESPACE_SOUNDS = {
  ui_select: { src: '/audio/ui/ui_select_pop.wav', volume: 0.55 },
  chat_message_send: { src: '/audio/ui/message_send_whip.wav', volume: 0.55 },
  trash_delete: { src: '/audio/ui/trash_delete_dissolve.wav', volume: 0.58 },
  system_attention: { src: '/audio/ui/system_alert_short.wav', volume: 0.48 },
  system_attention_long: { src: '/audio/ui/system_alert_long.wav', volume: 0.42 },
  system_critical: { src: '/audio/ui/system_alert_critical.wav', volume: 0.44 },
  notification_complete: { src: '/audio/ui/notification_complete.wav', volume: 0.58 },
  ui_toggle: { src: '/audio/ui/mouse_click_mechanical.wav', volume: 0.5 },
  ui_toggle_release: { src: '/audio/ui/mouse_click_mechanical_release.wav', volume: 0.48 },
  ui_click_soft: { src: '/audio/ui/mouse_click_soft.wav', volume: 0.52 },
  ui_click_soft_release: { src: '/audio/ui/mouse_click_soft_release.wav', volume: 0.5 },
  ui_click_sharp: { src: '/audio/ui/mouse_click_sharp.wav', volume: 0.48 },
  ui_click_sharp_release: { src: '/audio/ui/mouse_click_sharp_release.wav', volume: 0.46 },
  composer_key: { src: '/audio/ui/typing_key_01.wav', volume: 0.38 },
  typing_key_02: { src: '/audio/ui/typing_key_02.wav', volume: 0.38 },
  typing_key_03: { src: '/audio/ui/typing_key_03.wav', volume: 0.38 },
  typing_key_04: { src: '/audio/ui/typing_key_04.wav', volume: 0.38 },
  typing_key_05: { src: '/audio/ui/typing_key_05.wav', volume: 0.38 },
  typing_key_06: { src: '/audio/ui/typing_key_06.wav', volume: 0.38 },
} as const;

export type VibeSpaceSoundId = keyof typeof VIBESPACE_SOUNDS;

export const COMPOSER_KEY_SOUND_IDS = [
  'composer_key',
  'typing_key_02',
  'typing_key_03',
  'typing_key_04',
  'typing_key_05',
  'typing_key_06',
] as const satisfies readonly VibeSpaceSoundId[];

export const FREQUENT_SFX_IDS = [
  'ui_select',
  'chat_message_send',
  'trash_delete',
  'notification_complete',
  'ui_toggle',
  'ui_toggle_release',
  'ui_click_soft',
  'ui_click_soft_release',
  ...COMPOSER_KEY_SOUND_IDS,
] as const satisfies readonly VibeSpaceSoundId[];

export const COMPLETION_SFX_IDS = new Set<VibeSpaceSoundId>([
  'notification_complete',
  'system_attention',
  'system_attention_long',
  'system_critical',
]);
