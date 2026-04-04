<script lang="ts">
	import { goto } from '$app/navigation';

	let { data } = $props();
	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	async function handleSignOut() {
		await supabase.auth.signOut();
		goto('/login');
	}
</script>

<svelte:head>
	<title>Settings — MapOrganizer</title>
</svelte:head>

<div
	class="mx-auto max-w-lg px-4 py-8 pb-[max(5rem,calc(var(--app-dock-reserve,0px)+1.5rem))] sm:px-6 sm:py-10"
>
	<h1 class="text-2xl font-extrabold text-warm-800">Settings</h1>

	<section class="mt-8 rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
		<h2 class="text-sm font-extrabold uppercase tracking-wide text-warm-500">Account</h2>
		{#if session?.user?.email}
			<p class="mt-3 text-sm font-medium text-warm-700">{session.user.email}</p>
		{:else}
			<p class="mt-3 text-sm text-warm-500">You are signed in.</p>
		{/if}
		<button
			type="button"
			onclick={handleSignOut}
			class="mt-5 w-full rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm font-bold text-warm-700 transition-colors hover:bg-warm-100"
		>
			Sign out
		</button>
	</section>
</div>
