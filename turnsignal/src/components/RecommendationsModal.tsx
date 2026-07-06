import ModalCloseButton from './ModalCloseButton';

export default function RecommendationsModal({
  recommendations,
  onClose,
}: {
  recommendations: { emoji: string; text: string }[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md modal-h-85 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Recommendations</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                <span className="text-base leading-none flex-shrink-0 mt-0.5">{r.emoji}</span>
                <p className="text-sm text-ink leading-snug">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
