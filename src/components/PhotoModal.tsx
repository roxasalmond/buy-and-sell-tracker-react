interface Props {
  url: string;
  name: string;
  onClose: () => void;
}

export function PhotoModal({ url, name, onClose }: Props) {
  return (
    <div className="photo-modal" onClick={onClose} role="dialog" aria-label={name}>
      <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="photo-modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <img className="photo-modal-image" src={url} alt={name} />
        <p className="photo-modal-caption">{name}</p>
      </div>
    </div>
  );
}
