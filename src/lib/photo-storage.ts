import imageCompression from 'browser-image-compression';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlacePhoto } from '$lib/types/database';

const BUCKET = 'place-photos';
const MAX_UPLOAD_SIZE_MB = 4.5;
const MAX_DIMENSION = 1920;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export interface UploadResult {
	photo: PlacePhoto;
	publicUrl: string;
}

export function validateFile(file: File): string | null {
	if (!ACCEPTED_TYPES.includes(file.type)) return 'Unsupported file type. Use JPEG, PNG, or WebP.';
	return null;
}

interface CompressResult {
	blob: Blob;
	width: number;
	height: number;
}

async function compressImage(file: File): Promise<CompressResult> {
	if (typeof window === 'undefined') return { blob: file, width: 0, height: 0 };

	const compressed = await imageCompression(file, {
		maxSizeMB: MAX_UPLOAD_SIZE_MB,
		maxWidthOrHeight: MAX_DIMENSION,
		useWebWorker: true,
		fileType: 'image/jpeg',
		initialQuality: 0.85,
		preserveExif: false,
	});

	const url = URL.createObjectURL(compressed);
	const img = await imageCompression.loadImage(url);
	const width = img.naturalWidth;
	const height = img.naturalHeight;
	URL.revokeObjectURL(url);

	return { blob: compressed, width, height };
}

export async function uploadPlacePhoto(
	supabase: SupabaseClient,
	userId: string,
	placeId: string,
	file: File,
): Promise<UploadResult> {
	const { blob: compressed, width, height } = await compressImage(file);
	if (compressed.size > 5 * 1024 * 1024) {
		throw new Error('Image still too large after compression. Try a smaller image.');
	}
	const ext = 'jpg';
	const path = `${userId}/${placeId}/${crypto.randomUUID()}.${ext}`;

	const { error: uploadError } = await supabase.storage
		.from(BUCKET)
		.upload(path, compressed, { contentType: 'image/jpeg', upsert: false });

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
