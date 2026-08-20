import styles from "./ProbabilityBar.module.css";

export interface ProbabilityBarProps {
  value: number;
  label?: string;
  className?: string;
}

export function ProbabilityBar({
  value,
  label = "Probability",
  className,
}: ProbabilityBarProps) {
  const normalizedValue = Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
  const percentage = Math.round(normalizedValue * 1000) / 10;
  const classes = [styles.track, className].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      aria-valuetext={`${percentage}%`}
    >
      <span className={styles.fill} style={{ width: `${percentage}%` }} />
    </div>
  );
}
