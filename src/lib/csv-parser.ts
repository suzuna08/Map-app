import Papa from 'papaparse';

export interface GoogleMapsPlace {
	Title: string;
	Note: string;
	URL: string;
	Tags: string;
	Comment: string;
}

export interface ParseResult {
	places: GoogleMapsPlace[];
	fileName: string;
	errors: string[];
}

export function parseGoogleMapsCSV(file: File): Promise<ParseResult> {
	return new Promise((resolve) => {
		const fileName = file.name.replace(/\.csv$/i, '');

		Papa.parse<GoogleMapsPlace>(file, {
			header: true,
			skipEmptyLines: true,
			complete(results) {
				const places = results.data.filter((row) => row.Title && row.Title.trim() !== '');
				const errors = results.errors.map((e) => `Row ${e.row}: ${e.message}`);
				resolve({ places, fileName, errors });
			},
			error(err) {
				resolve({ places: [], fileName, errors: [err.message] });
			}
		});
	});
}
