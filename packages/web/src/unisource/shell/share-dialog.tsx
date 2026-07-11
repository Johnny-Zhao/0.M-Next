import { UsButton, UsModal, pushToast } from "../primitives";

export function ShareDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return (
    <UsModal
      open={open}
      onClose={onClose}
      title={
        <span>
          分享 <span className="us-data">Share</span>
        </span>
      }
      footer={<UsButton onClick={onClose}>关闭</UsButton>}
    >
      <div className="us-share-dialog">
        <label>
          <span>只读链接</span>
          <span className="us-share-dialog__link">
            <code className="us-data">/us/share/ws-unisource-demo/s3-spec</code>
            <UsButton
              onClick={() => pushToast({ title: "复制链接留待正式版" })}
              size="sm"
            >
              复制
            </UsButton>
          </span>
        </label>
        <p>打开时字段值按查看者的数据源权限脱敏显示。</p>
        {/* ShareDialog 正式稿后调整:当前仅实现 08-② 缺稿简版。 */}
      </div>
    </UsModal>
  );
}
