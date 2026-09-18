// ===== SKELETON LOADER COMPONENTS =====

import './Skeleton.css';

export function Skeleton({ className = '', style = {}, width, height, borderRadius }) {
  const customStyles = {
    ...style,
    width: width || style.width,
    height: height || style.height,
    borderRadius: borderRadius || style.borderRadius,
  };

  return <div className={`skeleton-shimmer ${className}`} style={customStyles} />;
}

Skeleton.Text = function SkeletonText({ className = '', lines = 1, lastLineShort = false, ...props }) {
  return (
    <div className={`skeleton-text-container ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className="skeleton-text-line" 
          width={lastLineShort && i === lines - 1 ? '60%' : '100%'}
          {...props} 
        />
      ))}
    </div>
  );
};

Skeleton.Avatar = function SkeletonAvatar({ size = 40, className = '', ...props }) {
  return (
    <Skeleton 
      className={`skeleton-avatar ${className}`} 
      width={size} 
      height={size} 
      borderRadius="50%" 
      {...props} 
    />
  );
};

Skeleton.Card = function SkeletonCard({ className = '', children, ...props }) {
  return (
    <div className={`skeleton-card-wrapper ${className}`} {...props}>
      {children}
    </div>
  );
};
