// 入力内容を解析して、メソッドを呼び出す
// Timesheets = loadTimesheets();

loadGSTimesheets = function () {
  var GSTimesheets = function(spreadsheet, settings) {
    this.spreadsheet = spreadsheet;
    this.settings = settings;
    this._spreadsheets = {};
    this._sheets = {};
    this.master_folder = DriveApp.getFileById(spreadsheet.getId()).getParents().next();
    this.employees_folder = DriveApp.searchFolders(`"${this.master_folder.getId()}" in parents and title = "Employees"`).next();

    this.scheme = {
      columns: [
        { name: '日付', format: 'yyyy"年"m"月"d"日（"ddd"）"', width: 150 },
        { name: '出勤', format: 'H:m', width: 100 },
        { name: '退勤', format: 'H:m', width: 100 },
        { name: '休憩時間', format: '[h]:mm', width: 100 },
        { name: '勤務時間', format: '[h]:mm', formula: '=RC[-2]-RC[-3]-RC[-1]', width: 100 },
        { name: 'メモ', width: 300 },
        { name: '承認者', width: 100 }
      ],
      properties: [
        { name: 'DayOff', value: '土,日', comment: '← 月,火,水みたいに入力してください。アカウント停止のためには「全部」と入れてください。'},
      ]
    };
  };

  GSTimesheets.prototype._getSpreadsheet = function (username) {
    if (this._spreadsheets[username]) return this._spreadsheets[username];

    const user_ss = this._createOrOpenUserSpreadsheet(this.employees_folder, username);
    this._spreadsheets[username] = user_ss;
    this._sheets[username] = {};

    return user_ss;
  };

  GSTimesheets.prototype._createOrOpenUserSpreadsheet = function (folder, username) {
    const user_ss = DriveApp.searchFiles(`"${folder.getId()}" in parents and mimeType = "${MimeType.GOOGLE_SHEETS}" and title = "${username}"`);
    if (user_ss.hasNext()) {
      return SpreadsheetApp.openById(user_ss.next().getId());
    }

    const new_ss = SpreadsheetApp.create(username);
    const prop_sheet = this._createOrOpenSheet(new_ss, '_設定');
    this._fillPropertiesSheet(prop_sheet);
    const new_ss_file = DriveApp.getFileById(new_ss.getId());
    folder.addFile(new_ss_file);
    DriveApp.getRootFolder().removeFile(new_ss_file);

    return new_ss;
  };

  GSTimesheets.prototype._getSheet = function(username, sheetName) {
    const spreadsheet = this._getSpreadsheet(username);
    if(this._sheets[username][sheetName]) return this._sheets[username][sheetName];

    const sheet = this._createOrOpenSheet(spreadsheet, sheetName);

    this._sheets[username][sheetName] = sheet;

    return sheet;
  };

  GSTimesheets.prototype._createOrOpenSheet = function (spreadsheet, sheetName) {
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName, spreadsheet.getNumSheets());
      if (!sheet) {
        throw `エラー: ${sheetName}のシートが作れませんでした`;
      }
    }
    return sheet;
  };

  GSTimesheets.prototype._fillPropertiesSheet = function (sheet) {
    // 中身が無い場合は新規作成
    if (sheet.getLastRow() == 0) {
      // 設定部の書き出し
      var properties = [["Properties count", this.scheme.properties.length, null]];
      this.scheme.properties.forEach(function(s) {
        properties.push([s.name, s.value, s.comment]);
      });
      sheet.getRange("A1:C"+(properties.length)).setValues(properties);
    }
    //this.on("newUser", username);
  };

  GSTimesheets.prototype._getMonthlySheet =  function (username, date) {
    const sheetName = `${date.getFullYear()}年${date.getMonth()}月`;
    const monthly_sheet = this._getSheet(username, sheetName);
    this._fillMonthlySheet(monthly_sheet, date);
    return monthly_sheet;
  };

  GSTimesheets.prototype._fillMonthlySheet = function (sheet, date) {
    // 中身が無い場合は新規作成
    if (sheet.getLastRow() == 0) {
      // ヘッダの書き出し
      const cols = this.scheme.columns.map(function (c) {
        return c.name;
      });
      sheet.getRange(2, 1, 1, cols.length).setValues([cols]);

      const year = date.getFullYear();
      const month = date.getMonth();
      const rows = [];

      for (const date = new Date(year, month, 1); date.getMonth() === month; date.setDate(date.getDate() + 1)) {
        const columns = [date.toLocaleDateString()];
        for (let i = 1; i < this.scheme.columns.length; i++) {
          columns.push(this.scheme.columns[i].hasOwnProperty('value') ? this.scheme.columns[i].value : '');
        }
        rows.push(columns);
      }
      sheet.getRange(3, 1, rows.length, cols.length).setValues(rows);

      for (let i = 0; i < this.scheme.columns.length; i++) {
        if (this.scheme.columns[i].hasOwnProperty('format')) {
          sheet.getRange(3, i + 1, rows.length, 1).setNumberFormat(this.scheme.columns[i].format);
        }
        if (this.scheme.columns[i].hasOwnProperty('formula')) {
          sheet.getRange(3, i + 1, rows.length, 1).setFormulaR1C1(this.scheme.columns[i].formula);
        }
        if (this.scheme.columns[i].hasOwnProperty('width')) {
          sheet.setColumnWidth(i + 1, this.scheme.columns[i].width);
        }
      }

      sheet.getRange('E1')
        .setFormulaR1C1(`=SUM(R[2]C:R[${2 + rows.length - 1}]C)`)
        .setNumberFormat('[h]:mm');
    }
  };

  GSTimesheets.prototype._getRowNo = function(date) {
    return date.getDate() + 2;
  };

  GSTimesheets.prototype.get = function(username, date) {
    var sheet = this._getMonthlySheet(username, date);
    var rowNo = this._getRowNo(date);
    var row = sheet.getRange(rowNo, 1, 1, this.scheme.columns.length).getValues()[0].map(function(v) {
      return v === '' ? undefined : v;
    });

    return({ user: username, date: row[0], signIn: row[1], signOut: row[2], rest: row[3], work: row[4], note: row[5], supervisor: row[6] });
  };

  GSTimesheets.prototype.set = function(username, date, params) {
    var row = this.get(username, date);
    _.extend(row, _.pick(params, 'signIn', 'signOut', 'rest', 'work', 'note', 'supervisor'));

    var sheet = this._getSheet(username);
    var rowNo = this._getRowNo(date);

    var data = [DateUtils.toDate(date), row.signIn, row.signOut, row.rest, row.work, row.note, row.supervisor].map(function(v) {
      return v == null ? '' : v;
    });
    sheet.getRange(rowNo, 1, 1, this.scheme.columns.length).setValues([data]);

    return row;
  };

  GSTimesheets.prototype.getUsers = function() {
    return _.compact(_.map(this.spreadsheet.getSheets(), function(s) {
      var name = s.getName();
      return String(name).substr(0, 1) == '_' ? undefined : name;
    }));
  };

  GSTimesheets.prototype.getByDate = function(date) {
    var self = this;
    return _.map(this.getUsers(), function(username) {
      return self.get(username, date);
    });
  };

  // 休みの曜日を数字で返す
  GSTimesheets.prototype.getDayOff = function(username) {
    var sheet = this._getSheet(username);
    return DateUtils.parseWday(sheet.getRange("B2").getValue());
  };

  return GSTimesheets;
};

if(typeof exports !== 'undefined') {
  exports.GSTimesheets = loadGSTimesheets();
}
