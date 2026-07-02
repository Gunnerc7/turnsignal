// A real touch target, not just a text label with a little padding.
// The previous "Close" buttons across every modal were sized to their
// text content only — on a phone, that's well under the ~44px minimum
// tap target both Apple and Google recommend, which is exactly why taps
// were being missed. minHeight/minWidth guarantee the real hit area even
// though the visible text stays small; the negative margin keeps it from
// visually shifting the modal's layout. touch-manipulation removes the
// browser's tap-delay/double-tap-zoom ambiguity that can make a tap feel
// unresponsive even when it does register.
export default function ModalCloseButton({
  onClick,
  label = 'Close',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="text-steel text-sm font-medium px-3 -mr-2 rounded-lg active:bg-gray-100 transition touch-manipulation flex-shrink-0"
      style={{ minHeight: 44, minWidth: 44 }}
    >
      {label}
    </button>
  );
}
