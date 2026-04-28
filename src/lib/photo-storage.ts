import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlacePhoto } from '$lib/types/database';

const BUCKET = 'place-photos';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export interface UploadResult {
	photo: PlacePhoto;
	publicUrl: string;
}

export function validateFile(file: File): string | null {
	if (!ACCEPTED_TYPES.includes(file.type)) return 'Unsupported file type. Use JPEG, PNG, or WebP.';
	if (file.size > MAX_FILE_SIZE) return 'File too large. Max 5 MB.';
	return null;
}

interface CompressResult {
	blob: Blob;
	width: number;
	height: number;
}

async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<CompressResult> {
	if (typeof window === 'undefined') return { blob: file, width: 0, height: 0 };

	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => {
			URL.revokeObjectURL(url);
			let { width, height } = img;
			if (width <= maxDim && height <= maxDim && file.size < 500_000) {
				resolve({ blob: file, width, height });
				return;
			}
			const scale = Math.min(maxDim / width, maxDim / height, 1);
			width = Math.round(width * scale);
			height = Math.round(height * scale);

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(img, 0, 0, width, height);
			canvas.toBlob(
				(blob) => (blob ? resolve({ blob, width, height }) : reject(new Error('Canvas compression failed'))),
				'image/jpeg',
				quality,
			);
		};
		img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
		img.src = url;
	});
}

export async function uploadPlacePhoto(
	supabase: SupabaseClient,
	userId: string,
	placeId: string,
	file: File,
): Promise<UploadResult> {
	const { blob: compressed, width, height } = await compressImage(file);
	const ext = file.type === 'image/png' ? 'png' : 'jpg';
	const path = `${userId}/${placeId}/${crypto.randomUUID()}.${ext}`;

	const { error: uploadError } = await supabase.storage
		.from(BUCKET)
		.upload(path, compressed, { contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`, upsert: false });

	if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

	const { data: row, error: insertError } = await supabase
		.from('place_photos')
		.insert({ place_id: placeId, user_id: userId, storage_path: path, width, height })
		.select()
		.single();

	if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

	const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

	return { photo: row as PlacePhoto, publicUrl };
}

export async function deletePlacePhoto(
	supabase: SupabaseClient,
	photoId: string,
	storagePath: string,
): Promise<void> {
	await supabase.storage.from(BUCKET).remove([storagePath]);
	await supabase.from('place_photos').delete().eq('id', photoId);
}

export async function loadPlacePhotos(
	supabase: SupabaseClient,
	placeId: string,
): Promise<{ photo: PlacePhoto; publicUrl: string }[]> {
	const { data, error } = await supabase
		.from('place_photos')
		.select('*')
		.eq('place_id', placeId)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: true });

	if (error) throw new Error(`Failed to load photos: ${error.message}`);
	if (!data?.length) return [];

	return data.map((photo) => {
		const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(photo.storage_path);
		return { photo: photo as PlacePhoto, publicUrl };
	});
}

export function getPhotoUrl(supabase: SupabaseClient, storagePath: string): string {
	const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
	return publicUrl;
}
