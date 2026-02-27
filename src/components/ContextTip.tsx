interface ContextTipProps {
  text: string;
}

function ContextTip(props: ContextTipProps) {
  return (
    <span className="context-tip" tabIndex={0} role="note" aria-label={props.text}>
      ?
      <span className="context-tip-bubble">{props.text}</span>
    </span>
  );
}

export default ContextTip;
