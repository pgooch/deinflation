import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'sync-fetch';

dotenv.config();

// Prepare thy variables
let inflationData = {
	status: 'pending',
	data: {},
	lastUpdated: new Date(-1),
};
let returnData = {};

/*
	Adjust

	This is the main function, it takes a value and 1 or 2 dates and returns an object with all
	sorts of information in it. If only 1 date is passed it will use the latest date in the data
	which is unlikely to be today but is as close as you can get with the provided data.
*/
export function adjust(value, dateA, dateB = null) {
	// Load data or get data and wait for it to be ready, if we haven't already done that
	if (inflationData.status === 'pending') {
		loadData();
	}

	// Prepare the return data
	returnData = {
		request: { value, dateA, dateB },
		process: {},
		notices: [],
		updatedDate: false,
		autoAdjustedDate: false,
	};

	// // Prepare the provided data and 
	value = parseFloat(value);
	dateA = normalizeDate(dateA);
	dateB = normalizeDate(dateB);
	returnData.process = { value, dateA, dateB };

	// Do the math
	let cpiA = inflationData.data[dateA[0]][dateA[1]];
	let cpiB = inflationData.data[dateB[0]][dateB[1]];
	let adjustedValue = (value / cpiA) * cpiB;
	returnData.process = { ...returnData.process, cpiA, cpiB, adjustedValue }

	// Prepare all sorts of return data
	returnData.type = adjustedValue - value > 0 ? 'inflation' : 'deflation';
	returnData.value = adjustedValue;
	returnData.valueDiff = adjustedValue - value;
	returnData.percent = (adjustedValue / value) * 100;
	returnData.money = Number(adjustedValue).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); adjustedValue
	returnData.moneyDiff = Number(adjustedValue - value).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); adjustedValue

	// Then actually return
	return returnData;
}

/*
	Data Last Updated

	This will return a pretty string with the data of the newest data in it.
*/
export function dataLastUpdated() {
	// Load data or get data and wait for it to be ready, if we haven't already done that
	if (inflationData.status === 'pending') {
		loadData();
	}

	let [year, month] = getLatestDate();
	month = ["January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	][month];

	return 'Inflation data last updated ' + month + ' ' + year;
}

/*
	Load Data

	This will attempt to load the data from the saved copt, the status will be set to updating
	when this is called but only set to ready if it is using the existing data without
	attempting to update it. It does not return anything it works on the global.
*/
async function loadData() {
	inflationData.status = 'updating';
	if (fs.existsSync('./inflation-data.json')) {
		try {
			inflationData = JSON.parse(fs.readFileSync('./inflation-data.json', { encoding: 'utf8' }));
		} catch (e) {
			fs.unlink('./inflation-data.json');
			throw new Error('💸 the deinflation data json file could not be parsed and was deleted. Please run again.');
		}
		console.log('💸 deinflation data loaded from file.');
		// Check if the data may need an update
		const [latestYear, latestMonth] = getEarliestDate();
		const currentDate = new Date().toLocaleString('en-US', { month: 'numeric', year: 'numeric' }).split('/').reverse().map(v => parseInt(v));
		if (latestYear !== currentDate[0] || latestMonth !== currentDate[1]) {
			if (new Date() - new Date(inflationData.lastUpdated) <= (24 * 60 * 60 * 1000)) {
				console.log('💸 deinflation data out of date, will try and update in a day or so.');
				inflationData.status = 'ready';
			} else {
				console.log('💸 deinflation data out of date, attempting update.');
				getData();
			}
		} else {
			inflationData.status = 'ready';
		}
	}
	if (inflationData.status !== 'ready') {
		console.log('💸 deinflation will need to gather BLS CPI data.');
		getData();
	}
}

/*
	Get Data

	This will use the BLS API create and update a data file containing all the monthly data to
	use for calculations. It runs if the data file is not found or if the latest date is more
	than 30 days old and it has not checked in 24 hours. It does not take or return anything it 
	works on the global.

	A BLS_API_KEY key is required for this, it's an enviromental variable with the API key from
	https://www.bls.gov/data/#api.
*/
async function getData() {
	let dataGetComplete = null;
	while (dataGetComplete === null) {
		console.log('💸 deinflation downloading data from ' + getLatestDate()[0] + ' onwards, currently have ' + Object.keys(inflationData.data).length + ' years of data.');

		let data = fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0?' + new URLSearchParams({
			registrationkey: process.env.BLS_API_KEY,
			catalog: 'false',
			startyear: getLatestDate()[0],
			endyear: parseInt(new Date().getFullYear()) + 1,
			calculations: 'false',
			annualaverage: 'true',
		}).toString()).json();
		if (data.status !== 'REQUEST_SUCCEEDED') {
			console.log(data);
			throw new Error('💸 the BLS API responded with something other than success.');
		}

		data.Results.series[0].data.forEach((entry) => {
			// Check and make sure we have the year
			if (inflationData.data[parseInt(entry.year)] === undefined) {
				inflationData.data[parseInt(entry.year)] = {};
			}
			// Get this months number
			let monthKey = entry.period.substr(1) === '13' ? 'AVG' : parseInt(entry.period.substr(1));
			// Add the data
			inflationData.data[parseInt(entry.year)][monthKey] = entry.value;
		})
		inflationData.lastUpdated = new Date();
		// Check if we've gone off the deep end
		dataGetComplete = data.message[0].match(/^No Data Available for Series CUUR0000SA0 Year: \d+$/)
	}

	inflationData.status = 'ready';
	fs.writeFileSync('inflation-data.json', JSON.stringify(inflationData))
	console.log('💸 deinflation data updated!');
}

/*
	This pair of functions do what they say on the tin, just want to be dry
	They work the same by just grabbing and parsing the data listings, it's actually simple.
	This presumes the data is sorted, which is is by the was we pull it. If the data is missing 
	the date 1913/1/1 (the start of the available from the API)
*/
function getEarliestDate() {
	if (Object.keys(inflationData.data).length === 0) { return [1913, 1]; }
	const Year = parseInt(Object.keys(inflationData.data)[0]);
	const Month = parseInt(Object.keys(inflationData.data[Year])[0]);
	return [Year, Month];
}
function getLatestDate() {
	if (Object.keys(inflationData.data).length === 0) { return [1913, 1]; }
	const Year = parseInt(Object.keys(inflationData.data).reverse()[0]);
	const Month = parseInt(Object.keys(inflationData.data[Year]).reverse()[1]); // This is 1 because 0 is "AVG"
	return [Year, Month];
}

/*
	Normalize Date

	This will try it's darndest to figure out a month/year combination to use for calculation,
	or if nothing is passed it will set the current date. In either case the date will be
	adjusted if it is outside the bounds of the data.
*/
function normalizeDate(date) {
	if (date === null || date === undefined) {
		date = [new Date().getFullYear(), new Date().getMonth() + 1]
		returnData.autoAdjustedDate = true;
	} else if (typeof date == 'object') {
		date = [date.year, date.month]
	} else if (typeof date == 'string' || typeof date == 'array') {
		if (typeof date == 'string') {
			date = date.split(/[-/]/g);
		}
		if (date.length === 3) {
			date = [parseInt(date[2]), parseInt(date[0])];
		} else if (date.length > 1) {
			date = date[1].length == 4 ? [parseInt(date[1]), parseInt(date[0])] : [parseInt(date[0]), parseInt(date[1])];
		} else {
			date[1] = 'AVG';
		}
	} else {
		throw new Error('💸 deinflation was asked to normalize "' + date + '" as a date but could not figure out how. See readme for accepted formats.')
	}
	// If the date is from before the data then set it to the earliest point in the data
	if (date[0] < Object.keys(inflationData.data)[0]) {
		date[0] = Object.keys(inflationData.data)[0];
		date[1] = Object.keys(inflationData.data[date[0]])[0];
		returnData.notices.push('Provided date was before the earliest data, set to ' + date[0] + '/' + date[1] + '.');
		returnData.updatedDate = true;
	}

	// If the date is newer that our latest data
	const [latestYear, latestMonth] = getLatestDate();
	if ((date[0] > latestYear) || (date[0] === latestYear && date[1] > latestMonth)) {
		if (!returnData.autoAdjustedDate) {
			returnData.notices.push('Provided date was after the latest data, set to ' + latestYear + '/' + latestMonth + '.');
		}
		returnData.updatedDate = true;
		date = [latestYear, latestMonth];
	}

	// Check the month while were at it
	if (parseInt(date[1]) < 1 || parseInt(date[1]) > 12) {
		returnData.notices.push('Unable to determin the month for ' + date[0] + ', using year average.');
		returnData.updatedDate = true;
		date[1] = 'AVG';
	}

	return date;
}

/*
	Self Test

	This gives npm test something to do and functions as a test that it can connect and all that.
	I know is it pretty much the worst way to do tests but it's not really that important here.
*/
if (process.argv.indexOf('--self-test') > 0) {
	console.log('💸 deinflation running self test.');
	const testString = 'An NES was $199.99 when released in October 1985, thats like ' + adjust(199.99, '10/1985', '8/1991').money + ' when the SNES came out in August 1991.';
	console.log('💸 ' + testString);
	if (testString === 'An NES was $199.99 when released in October 1985, thats like $251.32 when the SNES came out in August 1991.') {
		console.log('💸 deinflation appears to be working correctly.');
		process.exit(0);
	} else {
		console.log('💸 deinfation has somehow failed to adjust properly, more errors are likely logged.');
		process.exit(0);
	}
}
