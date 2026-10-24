<template>
	<p>{{ total }}</p>
</template>

<script>
export default {};

function plain(xs, ys) {
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

<script setup>
function setup(xs, ys) {
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
