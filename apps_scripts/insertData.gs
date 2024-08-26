function main() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetId = spreadsheet.getId();
  const fileId = getFileId();
  const query = "SELECT week_start_date, SUM(incurred_hours) as incurred_h, Name FROM (SELECT Date, startOfWeek(Date) AS week_start_date, CAST([Incurred (hours)] AS FLOAT) as incurred_hours, [Team Member] as Name FROM ? WHERE [Team Member] = ? ) GROUP BY week_start_date, Name";
  
  const SmartsheetData = "SmartsheetData";
  const columns = [1, 3, 5, 6, 10, 51];
  importCsvToSmartsheetData(fileId, sheetId, SmartsheetData, columns);

  const sheetName = "BudgetTracker";
  const sheetName2 = "Settings";
  const rangeNames = 'A29:A53';
  const additionalRangeNames = 'A65:A89';
  const Names_in_Settings = 'A18:A42';
  const BillRatesRangeSettings = 'D18:D42';
  const BillRatesRangeBT1 = 'C29:C53';
  const BillRatesRangeBT2 = 'C65:C89';
  const rangeDates = 'F28:GQ28';
  
  insertDistinctNames(fileId, sheetId, sheetName, rangeNames, additionalRangeNames, sheetName2, Names_in_Settings);
  insertBillRates(fileId, sheetId, sheetName, rangeNames, additionalRangeNames, BillRatesRangeBT1, BillRatesRangeBT2, sheetName2, Names_in_Settings, BillRatesRangeSettings);
  importCsvToSheet(fileId, sheetId, sheetName, rangeNames, additionalRangeNames, rangeDates, query);
}

function insertDistinctNames(fileId, sheetId, sheetName, rangeNames, additionalRangeNames, sheetName2, Names_in_Settings) {
  const csvData = readCSVFile(fileId);
  const parsedData = Utilities.parseCsv(csvData);
  const names = getDistinctNames(parsedData);
  Logger.log('names: ' + JSON.stringify(names));

  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);
  const settingsSheet = ss.getSheetByName(sheetName2);

  // Insert names into rangeNames and additionalRangeNames in "BudgetTracker"
  insertNamesIntoRange(sheet, names, rangeNames);
  insertNamesIntoRange(sheet, names, additionalRangeNames);

  // Insert names into Names_in_Settings in "Settings"
  insertNamesIntoRange(settingsSheet, names, Names_in_Settings);
}

function insertBillRates(fileId, sheetId, sheetName, rangeNames, additionalRangeNames, BillRatesRangeBT1, BillRatesRangeBT2, sheetName2, Names_in_Settings, BillRatesRangeSettings) {
  const csvData = readCSVFile(fileId);
  const parsedData = Utilities.parseCsv(csvData);
  const ratesData = getBillRates(parsedData);
  // Logger.log('rates: ' + ratesData);

  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);
  const settingsSheet = ss.getSheetByName(sheetName2);

  // Insert bill rates into BillRatesRangeBT1 and BillRatesRangeBT2 in "BudgetTracker"
  insertRatesIntoRange(sheet, ratesData, rangeNames, BillRatesRangeBT1);
  insertRatesIntoRange(sheet, ratesData, additionalRangeNames, BillRatesRangeBT2);

  // Insert bill rates into BillRatesRangeSettings in "Settings"
  insertRatesIntoRange(settingsSheet, ratesData, Names_in_Settings, BillRatesRangeSettings);
}

function getDistinctNames(data) {
  const nameIndex = data[0].indexOf("Team Member");
  const names = data.slice(1).map(row => row[nameIndex]);
  return [...new Set(names)]; // Get distinct names
}

function getBillRates(data) {
  const nameIndex = data[0].indexOf("Team Member");
  const rateIndex = data[0].indexOf("Bill Rate");
  const rates = data.slice(1).map(row => ({ name: row[nameIndex], rate: row[rateIndex] }));
  return rates;
}

function insertNamesIntoRange(sheet, names, range) {
  const rangeObj = sheet.getRange(range);
  const rangeHeight = rangeObj.getHeight();

  names.slice(0, rangeHeight).forEach((name, index) => {
    sheet.getRange(rangeObj.getRow() + index, rangeObj.getColumn()).setValue(name);
  });
}

function insertRatesIntoRange(sheet, ratesData, namesRange, ratesRange) {
  const names = sheet.getRange(namesRange).getValues().flat();
  const rangeObj = sheet.getRange(ratesRange);

  names.forEach((name, index) => {
    const rateObj = ratesData.find(rate => rate.name === name);
    const rate = rateObj ? rateObj.rate : '';
    sheet.getRange(rangeObj.getRow() + index, rangeObj.getColumn()).setValue(rate);
  });
}

function importCsvToSheet(fileId, sheetId, sheetName, rangeNames, additionalRangeNames, rangeDates, query) {
  const csvData = readCSVFile(fileId);
  const parsedData = Utilities.parseCsv(csvData);
  const results = queryData(parsedData, sheetId, sheetName, rangeNames, query);
  writeResultsToSheet(sheetId, sheetName, results, rangeNames, rangeDates);
  writeResultsToSheet(sheetId, sheetName, results, additionalRangeNames, rangeDates);
}

function readCSVFile(fileId) {
  const file = DriveApp.getFileById(fileId);
  return file.getBlob().getDataAsString();
}

function queryData(data, sheetId, sheetName, rangeNames, query) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);
  const nameValues = sheet.getRange(rangeNames).getValues().flat().filter(String);

  const records = data.slice(1).map(row => {
    const obj = {};
    data[0].forEach((key, index) => obj[key] = row[index]);
    return obj;
  });
  // Logger.log('records: ' + JSON.stringify(records));
  const values = nameValues.flatMap(name => alasql(query, [records, name]));
  Logger.log('data values: ' + JSON.stringify(values));
  return values;
}

function writeResultsToSheet(sheetId, sheetName, results, rangeNames, rangeDates) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);
  const dateValues = sheet.getRange(rangeDates).getValues()[0].map(date => formatDateToISO(date));
  const nameValues = sheet.getRange(rangeNames).getValues().flat();

  results.forEach(({ week_start_date, incurred_h, Name }) => {
    const dateIndex = dateValues.findIndex(date => new Date(date).toDateString() === new Date(week_start_date).toDateString());
    const nameIndex = nameValues.indexOf(Name);

    if (dateIndex !== -1 && nameIndex !== -1) {
      const row = sheet.getRange(rangeNames).getRow() + nameIndex;
      const column = sheet.getRange(rangeDates).getColumn() + dateIndex;
      sheet.getRange(row, column).setValue(incurred_h);
    }
  });
}

function formatDateToISO(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0'); // Month is zero-based
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


function importCsvToSmartsheetData(fileId, sheetId, sheetName, columns) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);
  const data = Utilities.parseCsv(readCSVFile(fileId)).slice(1);
  const filteredData = data.map(row => columns.map(colIndex => row[colIndex]));
  sheet.getRange(4, 1, filteredData.length, filteredData[0].length).setValues(filteredData);
}

function setFileId(fileId) {
  PropertiesService.getUserProperties().setProperty('csvFileId', fileId);
  Logger.log('File ID: ' + JSON.stringify(fileId));
}

function getFileId() {
  const fileId = PropertiesService.getUserProperties().getProperty('csvFileId');
  Logger.log('Retrieved File ID: ' + JSON.stringify(fileId));
  return fileId;
}

function includeAlaSQL() {
  const url = "https://cdnjs.cloudflare.com/ajax/libs/alasql/0.4.11/alasql.min.js";
  eval(UrlFetchApp.fetch(url).getContentText());
}

includeAlaSQL();

alasql.fn.startOfWeek = function(date) {
  // Split the date string and construct a new Date object in the correct format
  const [year, month, day] = date.split('-');
  const d = new Date(year, month - 1, day); // month is zero-based in JavaScript Date object

  const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1);
  
  // Logger.log('date: ' + JSON.stringify(d));
  // Logger.log('d.getDate(): ' + JSON.stringify(d.getDate()));
  // Logger.log('d.getDay(): ' + JSON.stringify(d.getDay()));
  // Logger.log('diff: ' + JSON.stringify(diff));
  
  const startOfWeekDate = new Date(d.setDate(diff));
  const startOfWeekISO = startOfWeekDate.toISOString().split('T')[0];
  
  // Logger.log('start of the week: ' + JSON.stringify(startOfWeekISO));
  
  return startOfWeekISO;
};

