import {
  TOOLKIT_PALETTES,
  TOOLKIT_THEME_FIELDS,
  TOOLKIT_FONT_STYLE_MODES,
  createToolkitThemeFromPalette,
} from './themeSystem.js';

export function ToolkitThemeControls({
  themeState,
  onThemeStateChange,
  panelTitle = 'Theme Controls',
}) {
  function handlePaletteChange(event) {
    const nextPaletteId = event.target.value;
    onThemeStateChange((previous) => createToolkitThemeFromPalette(nextPaletteId, previous));
  }

  function handleToggleCustom(event) {
    const checked = event.target.checked;
    onThemeStateChange((previous) => ({
      ...previous,
      useCustomColors: checked,
    }));
  }

  function handleFontStyleChange(event) {
    const nextMode = event.target.value;
    onThemeStateChange((previous) => ({
      ...previous,
      fontStyleMode: nextMode,
    }));
  }

  function handleCustomColorChange(key, rawValue) {
    const normalized = rawValue.trim().toUpperCase();
    if (!/^#([0-9A-F]{6})$/.test(normalized)) {
      return;
    }

    onThemeStateChange((previous) => ({
      ...previous,
      customColors: {
        ...previous.customColors,
        [key]: normalized,
      },
    }));
  }

  const panelStyle = {
    marginTop: '20px',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid var(--ch-border, #4A4238)',
    background: 'var(--ch-surface, #2B2926)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  const labelStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--ch-muted, #A39A8D)',
  };

  const inputStyle = {
    borderRadius: '6px',
    border: '1px solid var(--ch-border, #4A4238)',
    background: 'var(--ch-bg, #1C1B19)',
    color: 'var(--ch-text, #EFEAE2)',
    padding: '8px 10px',
    fontSize: '13px',
  };

  return (
    <section style={panelStyle}>
      <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--ch-text, #EFEAE2)' }}>{panelTitle}</h3>

      <label style={labelStyle}>
        Palette
        <select value={themeState.paletteId} onChange={handlePaletteChange} style={inputStyle}>
          {TOOLKIT_PALETTES.map((palette) => (
            <option key={palette.id} value={palette.id}>{palette.name}</option>
          ))}
        </select>
        <span>{TOOLKIT_PALETTES.find((item) => item.id === themeState.paletteId)?.description}</span>
      </label>

      <label style={labelStyle}>
        Font style
        <select
          value={themeState.fontStyleMode || TOOLKIT_FONT_STYLE_MODES[0].id}
          onChange={handleFontStyleChange}
          style={inputStyle}
        >
          {TOOLKIT_FONT_STYLE_MODES.map((mode) => (
            <option key={mode.id} value={mode.id}>{mode.label}</option>
          ))}
        </select>
        <span>
          {TOOLKIT_FONT_STYLE_MODES.find(
            (mode) => mode.id === (themeState.fontStyleMode || TOOLKIT_FONT_STYLE_MODES[0].id),
          )?.description}
        </span>
      </label>

      <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
        <input type="checkbox" checked={themeState.useCustomColors} onChange={handleToggleCustom} />
        Use custom colors
      </label>

      {themeState.useCustomColors && (
        <div
          style={{
            display: 'grid',
            gap: '10px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          }}
        >
          {TOOLKIT_THEME_FIELDS.map((field) => (
            <label key={field.key} style={labelStyle}>
              {field.label}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={themeState.customColors[field.key]}
                  onChange={(event) => handleCustomColorChange(field.key, event.target.value)}
                  style={{
                    width: '42px',
                    height: '30px',
                    padding: 0,
                    border: '1px solid var(--ch-border, #4A4238)',
                    borderRadius: '6px',
                    background: 'transparent',
                  }}
                />
                <input
                  type="text"
                  value={themeState.customColors[field.key]}
                  onChange={(event) => handleCustomColorChange(field.key, event.target.value)}
                  style={{
                    ...inputStyle,
                    width: '100%',
                    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  }}
                />
              </div>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

export default ToolkitThemeControls;
