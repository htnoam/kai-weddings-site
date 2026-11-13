// KAI budget grid: a Google-Sheets-like spreadsheet (Univer, open source) for the guest-list page.
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import enUS from '@univerjs/preset-sheets-core/locales/en-US';
import '@univerjs/preset-sheets-core/lib/index.css';
// Dropdowns (status), colour rules (status, late dates) and filters in the header row
import { UniverSheetsDataValidationPreset } from '@univerjs/preset-sheets-data-validation';
import dvEnUS from '@univerjs/preset-sheets-data-validation/locales/en-US';
import '@univerjs/preset-sheets-data-validation/lib/index.css';
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/preset-sheets-conditional-formatting';
import cfEnUS from '@univerjs/preset-sheets-conditional-formatting/locales/en-US';
import '@univerjs/preset-sheets-conditional-formatting/lib/index.css';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import ftEnUS from '@univerjs/preset-sheets-filter/locales/en-US';
import '@univerjs/preset-sheets-filter/lib/index.css';

window.KaiGrid = {
  // mount(element, workbook snapshot, { readOnly, onChange }) -> { snapshot(), setValues(sheet, a1, rows), dispose() }
  mount: function (el, snapshot, opts) {
    opts = opts || {};
    var made = createUniver({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: mergeLocales(enUS, dvEnUS, cfEnUS, ftEnUS) },
      presets: [UniverSheetsCorePreset({ container: el, header: !opts.readOnly, toolbar: !opts.readOnly, footer: { sheetBar: true, statisticBar: true, menus: false, zoomSlider: true } }),
        UniverSheetsDataValidationPreset(), UniverSheetsConditionalFormattingPreset(), UniverSheetsFilterPreset()]
    });
    var api = made.univerAPI, wb = api.createWorkbook(snapshot);
    if (opts.readOnly) wb.setEditable(false);
    var quiet = false, sub = null;
    if (opts.onChange) {
      sub = api.addEvent(api.Event.CommandExecuted, function (ev) {
        // type 2 = mutation (a real change to the workbook)
        if (!quiet && ev && ev.type === 2) opts.onChange();
      });
    }
    return {
      snapshot: function () { return wb.save(); },
      setValues: function (sheetName, a1, rows) {
        var s = wb.getSheetByName(sheetName); if (!s) return false;
        quiet = true; try { s.getRange(a1).setValues(rows); } finally { quiet = false; }
        return true;
      },
      getValue: function (sheetName, a1) { var s = wb.getSheetByName(sheetName); return s ? s.getRange(a1).getValue() : null; },
      api: api, wb: wb,
      dispose: function () { try { if (sub) sub.dispose(); made.univer.dispose(); } catch (e) {} }
    };
  }
};
