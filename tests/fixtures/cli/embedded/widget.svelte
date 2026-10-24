<script context="module">
	export const size = 1;
</script>

<script>
function instance(xs, ys) {
	if (xs) log(xs);
	if (ys) log(ys);
	if (xs && ys) log(xs, ys);
	for (const x of xs) {
		for (const y of ys) if (y) log(x, y);
		for (const y of ys) if (!y) log(x);
	}
	tail();
}
</script>

<p>{size}</p>
