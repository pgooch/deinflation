# deinflation
This is a simple module that will calculate the inflation or deflation of a value between to date to the month by pulling the consumer price index data from the bureau of labor statistics.

## API Key
In order the the script to run it will need an enviromental `BLS_API_KEY` variable with an API. You can register for one at https://www.bls.gov/data/#api.

## Usage

First, it will need to be installed like every other package

    npm install deinflation

The primary function is the `adjust( value, dateA, dateB )` one, this will adjust a value for the two provided dates. If only one date is provided the other will be set as the latest date in the data set (as close to 'today' as possible). Returns an object with numerous bits of useful values, take for example the returned object for `adjust(199.99, '10/1985')`;

    {
    request: { value: 199.99, dateA: '10/1985', dateB: '5/2021' },
    process: {
        value: 199.99,
        dateA: [ 1985, 10 ],
        dateB: [ 2021, 5 ],
        cpiA: '108.7',
        cpiB: '269.195',
        adjustedValue: 495.27422309107635
    },
    notices: [],
    updatedDate: false,
    autoAdjustedDate: false,
    type: 'inflation',
    value: 495.27422309107635,
    valueDiff: 295.28422309107634,
    percent: 247.64949402023916,
    money: '$495.27',
    moneyDiff: '$295.28'
    }

The only other function designed for direct use (not that the others are restricted) is the `dataLastUpdated()` function which returns a pretty string with the date the data was last updated. This is the date of the latest data in the dataset, _not_ the last date the data was checked. For example, when called during development in August it reads;

    Inflation data last updated July 2021

## About the data
The data used in internal calculations is gathered from the latest report from http://www.bls.gov/cpi/tables.htm in Table 24. It is stored in a json file with a bit of meta data about when it was pulled. The data will attempt to update every 24hrs after the data is officially out of date however the BLS does not publish this data with any regularity I found noted
