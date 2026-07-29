export function OrigamiChatDecor() {
  return (
    <div aria-hidden="true" className="origami-chat-decor" data-testid="origami-chat-decor">
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
