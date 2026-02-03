import { Component, computed, input, viewChild, ViewEncapsulation } from '@angular/core';
import { GridSettings } from 'handsontable/settings';
import { HotTableComponent, HotTableModule, NON_COMMERCIAL_LICENSE } from "@handsontable/angular-wrapper";
import { CellValue } from 'handsontable/common';

@Component({
  selector: 'tm-data-grid',
  imports: [HotTableModule],
  templateUrl: './data-grid.component.html',
  styleUrl: './data-grid.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DataGridComponent {
  hotTable = viewChild.required(HotTableComponent);

  isReadOnly = input(false);
  minRows = input(1);
  data = input<CellValue[][]>([]);
  colHeaders = input<string[]>([]);

  gridData = computed<CellValue[][] | undefined>(() => this.data().length > 0 ? this.data() : undefined);

  readonly gridSettings = computed<GridSettings>(() => ({
    licenseKey: NON_COMMERCIAL_LICENSE,
    themeName: 'ht-theme-main',
    autoWrapRow: true,
    autoWrapCol: true,
    autoColumnSize: true,
    autoRowSize: true,
    contextMenu: ["row_above", "row_below", "remove_row", "undo", "redo", "copy", "cut"],
    colHeaders: this.colHeaders().length > 0 ? this.colHeaders() : true,
    columnSorting: true,
    height: 'auto',
    minCols: this.colHeaders().length || 5,
    minRows: this.minRows(),
    maxCols: this.colHeaders().length || 5,
    minSpareRows: this.isReadOnly() ? 0 : 1,
    stretchH: 'all',
    readOnly: this.isReadOnly(),
    rowHeaders: true,
    width: '100%',
    wordWrap: true,
  }));

  getData(): CellValue[][] {
    const hotInstance = this.getHotInstance();
    return hotInstance?.getData() ?? [];
  }

  addRows(numberOfRows: number): void {
    const hotInstance = this.getHotInstance();
    if (hotInstance) {
      hotInstance.alter("insert_row_below", hotInstance.countRows(), numberOfRows);
    }
  }

  styleRows(rowIdxToClass: Record<number, string>): void {
    console.log('Styling rows with classes:', rowIdxToClass);
    const hotInstance = this.getHotInstance();
    if (!hotInstance) return;

    const numCols = hotInstance.countCols();
    const numRows = hotInstance.countRows();

    // Clear all cell meta classNames
    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        hotInstance.removeCellMeta(row, col, 'className');
      }
    }

    // Apply new classNames to entire rows
    for (const [rowIdx, className] of Object.entries(rowIdxToClass)) {
      const row = Number(rowIdx);
      for (let col = 0; col < numCols; col++) {
        hotInstance.setCellMeta(row, col, 'className', className);
      }
    }

    hotInstance.render();
  }

  private getHotInstance() {
    return this.hotTable().hotInstance;
  }
}

