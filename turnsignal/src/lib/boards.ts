export type StageConfig = { key: string; label: string };
export type BoardConfig = { key: string; label: string; stages: StageConfig[] };

// "board" and "stage" are both text columns on the vehicles table.
// Main board has 6 real stages a vehicle moves through.
// Each sidebar board is its own single-column list — board key and
// stage key are the same value for those.
export const MAIN_BOARD: BoardConfig = {
  key: 'main',
  label: 'Main Board',
  stages: [
    { key: 'inbound_trade_in', label: 'Inbound / Trade-In' },
    { key: 'service', label: 'Service' },
    { key: 'detail_backlog', label: 'Detail Backlog' },
    { key: 'active_detail', label: 'Active Detail' },
    { key: 'ready_for_photos', label: 'Ready for Photos' },
    { key: 'price_for_lot', label: 'Price for Lot' },
  ],
};

export const SIDEBAR_BOARDS: BoardConfig[] = [
  {
    key: 'loaners',
    label: 'Loaners',
    stages: [
      { key: 'loaners', label: 'Loaners' },
      { key: 'service_loaners', label: 'Service Loaners' },
    ],
  },
  { key: 'body_shop', label: 'Body Shop', stages: [{ key: 'body_shop', label: 'Body Shop' }] },
  {
    key: 'waiting_on_title',
    label: 'Waiting on Title',
    stages: [{ key: 'waiting_on_title', label: 'Waiting on Title' }],
  },
  {
    key: 'auction_wholesale',
    label: 'Auction / Wholesale',
    stages: [{ key: 'auction_wholesale', label: 'Auction / Wholesale' }],
  },
];

export const ALL_BOARDS: BoardConfig[] = [MAIN_BOARD, ...SIDEBAR_BOARDS];

export function getBoard(boardKey: string): BoardConfig {
  return ALL_BOARDS.find((b) => b.key === boardKey) ?? MAIN_BOARD;
}
