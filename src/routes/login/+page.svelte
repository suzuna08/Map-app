<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { data } = $props();
	let supabase = $derived(data.supabase);

	let isSignUp = $state(false);
	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');
	let message = $state('');

	const DEFAULT_REDIRECT = '/places';

	const confirmError = $derived($page.url.searchParams.get('error') === 'invalid-confirmation-link');

	function getSafeRedirect(url: string | null): string {
		if (!url) return DEFAULT_REDIRECT;

		try {
			const decoded = decodeURIComponent(url);
			if (!decoded.startsWith('/') || decoded.startsWith('//')) return DEFAULT_REDIRECT;
			if (decoded.startsWith('/login')) return DEFAULT_REDIRECT;
			return decoded;
		} catch {
			return DEFAULT_REDIRECT;
		}
	}

	function getEmailRedirectTo(): string {
		return `${$page.url.origin}/auth/confirm?next=/login`;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		message = '';

		if (isSignUp) {
			const { error: err } = await supabase.auth.signUp({
				email,
				password,
				options: { emailRedirectTo: getEmailRedirectTo() }
			});
			if (err) {
				error = err.message;
			} else {
				message = 'Check your email for a confirmation link!';
			}
		} else {
			const { error: err } = await supabase.auth.signInWithPassword({ email, password });
			if (err) {
				error = err.message;
			} else {
				const redirectTo = getSafeRedirect($page.url.searchParams.get('redirect'));
				goto(redirectTo);
			}
		}

		loading = false;
	}
</script>

<div class="flex min-h-[70vh] items-center justify-center">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100">
				<svg class="h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
					<circle cx="12" cy="10" r="3" />
				</svg>
			</div>
			<h1 class="text-2xl font-bold text-warm-800">
				{isSignUp ? 'Create your account' : 'Welcome back'}
			</h1>
			<p class="mt-1 text-sm text-warm-500">
				{isSignUp ? 'Start organizing your saved places' : 'Sign in to your account'}
			</p>
		</div>

		{#if confirmError}
			<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
				Your confirmation link was invalid or has expired. Please sign up again.
			</div>
		{/if}

		{#if error}
			<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
		{/if}

		{#if message}
			<div class="mb-4 rounded-lg bg-sage-100 p-3 text-sm text-sage-800">{message}</div>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="email" class="mb-1 block text-sm font-semibold text-warm-700">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
				class="w-full rounded-lg border border-warm-200 bg-warm-50 px-3 py-2.5 text-base shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:text-sm"
				placeholder="you@example.com"
				/>
			</div>

			<div>
				<label for="password" class="mb-1 block text-sm font-semibold text-warm-700">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					required
					minlength="6"
				class="w-full rounded-lg border border-warm-200 bg-warm-50 px-3 py-2.5 text-base shadow-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:text-sm"
				placeholder="At least 6 characters"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
			>
				{#if loading}
					Processing...
				{:else}
					{isSignUp ? 'Create Account' : 'Sign In'}
				{/if}
			</button>
		</form>

		<p class="mt-6 text-center text-sm text-warm-500">
			{isSignUp ? 'Already have an account?' : "Don't have an account?"}
			<button
				onclick={() => { isSignUp = !isSignUp; error = ''; message = ''; }}
				class="font-bold text-brand-600 hover:text-brand-700"
			>
				{isSignUp ? 'Sign in' : 'Sign up'}
			</button>
		</p>
	</div>
</div>
