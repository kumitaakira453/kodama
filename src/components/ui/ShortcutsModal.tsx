import { Modal } from "./Modal";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "移動",
    items: [
      ["n / p", "次 / 前のファイルへ"],
      ["] / [", "次 / 前の未読ファイルへ"],
      ["⌘F", "ファイルを絞り込む"],
      ["⌘B", "サイドバーの開閉"],
    ],
  },
  {
    title: "読む",
    items: [
      ["v", "閲覧済みの切り替え"],
      ["c", "ファイルの折りたたみ"],
      ["u", "並べて表示 / 1 列表示"],
      ["w", "行内の差分の強調"],
    ],
  },
  {
    title: "指摘",
    items: [
      ["行番号をクリック", "その行に指摘する"],
      ["Shift + クリック", "範囲を指定する"],
      ["⌘Enter", "保存 / 返信"],
      ["Esc", "選択の解除"],
    ],
  },
  {
    title: "その他",
    items: [
      ["⌘O", "プロジェクトを追加"],
      ["⌘R", "再読込"],
      ["?", "この一覧"],
    ],
  },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="キーボード操作" onClose={onClose}>
      <div className="kd-keys">
        {GROUPS.map((g) => (
          <section key={g.title} className="kd-keys__group">
            <h3 className="kd-keys__title">{g.title}</h3>
            <dl className="kd-keys__list">
              {g.items.map(([key, desc]) => (
                <div key={key} className="kd-keys__row">
                  <dt>
                    <kbd className="kd-kbd">{key}</kbd>
                  </dt>
                  <dd>{desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <footer className="kd-modal__foot">
        <p className="kd-modal__note">
          指摘は `kodama review list` からも読めます。
        </p>
      </footer>
    </Modal>
  );
}
