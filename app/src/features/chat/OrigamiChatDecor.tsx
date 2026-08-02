import { useUIStore } from '@/stores/ui';

export function OrigamiChatDecor() {
  const theme = useUIStore((state) => state.theme);
  if (theme !== 'vibespace') return null;

  return (
    <div aria-hidden="true" className="origami-chat-decor hidden" data-testid="origami-chat-decor">
      <img
        alt=""
        className="origami-chat-decor__ribbon"
        draggable={false}
        src="/assets/origami-chat/top-ribbon.svg"
      />
      <img
        alt=""
        className="origami-chat-decor__crane"
        draggable={false}
        src="/assets/origami-chat/crane.webp"
      />
      <img
        alt=""
        className="origami-chat-decor__foliage"
        draggable={false}
        src="/assets/origami-chat/left-foliage.webp"
      />
      <img
        alt=""
        className="origami-chat-decor__mountains"
        draggable={false}
        src="/assets/origami-chat/bottom-mountains.svg"
      />
      <img
        alt=""
        className="origami-chat-decor__flower"
        draggable={false}
        src="/assets/origami-chat/right-flower.webp"
      />
    </div>
  );
}
