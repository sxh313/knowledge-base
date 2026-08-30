import Select from '../ui/Select';

export type SettingsSelectOption = {
  value: string;
  label: string;
};

type SettingsSelectProps = {
  value: string;
  options: SettingsSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
};

/** 设置页兼容层：所有下拉选择统一由应用级 Select 渲染。 */
export default function SettingsSelect({ value, options, onChange, className = '', ariaLabel }: SettingsSelectProps) {
  return <Select value={value} options={options} onChange={onChange} ariaLabel={ariaLabel ?? '选择选项'} className={`w-full ${className}`} />;
}
