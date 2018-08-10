// 各モジュールの読み込み
var initLibraries = function() {
  if(typeof EventListener === 'undefined') EventListener = loadEventListener();
  if(typeof DateUtils === 'undefined') DateUtils = loadDateUtils();
  if(typeof GASProperties === 'undefined') GASProperties = loadGASProperties();
  if(typeof GSProperties === 'undefined') GSProperties = loadGSProperties();
  if(typeof GSTemplate === 'undefined') GSTemplate = loadGSTemplate();
  if(typeof GSTimesheets === 'undefined') GSTimesheets = loadGSTimesheets();
  if(typeof Timesheets === 'undefined') Timesheets = loadTimesheets();
  if(typeof Slack === 'undefined') Slack = loadSlack();
}

var init = function() {
  initLibraries();

  var global_settings = new GASProperties();

  var spreadsheetId = global_settings.get('spreadsheet');
  if(spreadsheetId) {
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var settings = new GSProperties(spreadsheet);
    var template = new GSTemplate(spreadsheet);
    var slack = new Slack(settings.get('Slack Incoming URL'), template, settings);
    var storage = new GSTimesheets(spreadsheet, settings);
    var timesheets = new Timesheets(storage, settings, slack);
    return({
      receiver: slack,
      timesheets: timesheets,
      storage: storage
    });
  }
  return null;
}

// SlackのOutgoingから来るメッセージ
function doPost(e) {
  var miyamoto = init();
  miyamoto.receiver.receiveMessage(e.parameters);
}

// Time-based triggerで実行
function confirmSignIn() {
  var miyamoto = init();
  miyamoto.timesheets.confirmSignIn();
}

// Time-based triggerで実行
function confirmSignOut() {
  var miyamoto = init();
  miyamoto.timesheets.confirmSignOut();
}


// 初期化する
function setUp() {
  initLibraries();

  // spreadsheetが無かったら初期化
  var global_settings = new GASProperties();
  if(!global_settings.get('spreadsheet')) {

    // タイムシートを作る
    const spreadsheet = createSpreadsheetInMasterFolder("Slack Timesheets");
    var sheets = spreadsheet.getSheets();
    if(sheets.length == 1 && sheets[0].getLastRow() == 0) {
      sheets[0].setName('_設定');
    }
    global_settings.set('spreadsheet', spreadsheet.getId());

    var settings = new GSProperties(spreadsheet);
    settings.set('Slack Incoming URL', '');
    settings.setNote('Slack Incoming URL', 'Slackのincoming URLを入力してください');
    settings.set('開始日', DateUtils.format("Y-m-d", DateUtils.now()));
    settings.setNote('開始日', '変更はしないでください');
    settings.set('無視するユーザ', 'miyamoto,hubot,slackbot,incoming-webhook');
    settings.setNote('無視するユーザ', '反応をしないユーザを,区切りで設定する。botは必ず指定してください。');
    settings.set('休憩時間', '1:30:00');
    settings.setNote('休憩時間', '勤務時間からデフォルトで差し引かれる休憩時間を入力してください');
    settings.set('丸め単位（分）', '30');
    settings.setNote('丸め単位（分）', '出退勤時刻の丸め単位を分単位で入力してください');
    settings.set('管理者メールアドレス', 'taimei@arsaga.jp');
    settings.setNote('管理者メールアドレス', 'ファイルのオーナーになるユーザーのメールアドレスを入力してください');

    // 休日を設定 (iCal)
    var calendarId = 'ja.japanese#holiday@group.v.calendar.google.com';
    var calendar = CalendarApp.getCalendarById(calendarId);
    var startDate = DateUtils.now();
    var endDate = new Date(startDate.getFullYear() + 1, startDate.getMonth());
    var holidays = _.map(calendar.getEvents(startDate, endDate), function(ev) {
      return DateUtils.format("Y-m-d", ev.getAllDayStartDate());
    });
    settings.set('休日', holidays.join(', '));
    settings.setNote('休日', '日付を,区切りで。来年までは自動設定されているので、以後は適当に更新してください');

    // メッセージ用のシートを作成
    new GSTemplate(spreadsheet);

    // 毎日12時頃に出勤してるかチェックする
    ScriptApp.newTrigger('confirmSignIn')
      .timeBased()
      .everyDays(1)
      .atHour(12)
      .create();

    // 毎日23時45分頃に退勤してるかチェックする
    ScriptApp.newTrigger('confirmSignOut')
      .timeBased()
      .everyDays(1)
      .atHour(23)
      .nearMinute(45)
      .create();
  }
}

function createSpreadsheetInMasterFolder(name) {
  const spreadsheet = SpreadsheetApp.create(name);
  moveSpreadsheetToFolder(spreadsheet, getMasterFolder());
  return spreadsheet;
}

function getMasterFolder() {
  const script_id = ScriptApp.getScriptId();
  return DriveApp.getFileById(script_id).getParents().next();
}

function moveSpreadsheetToFolder(spreadsheet, folder) {
  const ss_file = DriveApp.getFileById(spreadsheet.getId());
  folder.addFile(ss_file);
  DriveApp.getRootFolder().removeFile(ss_file);
}

/* バージョンアップ処理を行う */
function migrate() {
  if(typeof GASProperties === 'undefined') GASProperties = loadGASProperties();

  var global_settings = new GASProperties();
  global_settings.set('version', "::VERSION::");
  console.log("バージョンアップが完了しました。");
}



/*
function test1(e) {
  var miyamoto = init();
  miyamoto.receiver.receiveMessage({user_name:"masuidrive", text:"hello 8:00"});
}
*/
