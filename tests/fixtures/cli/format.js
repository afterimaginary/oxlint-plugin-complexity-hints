// One diagnostic, to pin the default format.
export function format(rows) {
	for (const row of rows) {
		if (row) log(row);
	}
}
