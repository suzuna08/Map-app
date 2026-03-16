export interface Database {
	public: {
		Tables: {
			places: {
				Row: {
					id: string;
					user_id: string;
					title: string;
					note: string | null;
					url: string | null;
					tags: string | null;
					comment: string | null;
					source_list: string | null;
					created_at: string;
					google_place_id: string | null;
					category: string | null;
					primary_type: string | null;
					rating: number | null;
					rating_count: number | null;
					price_level: string | null;
					address: string | null;
					area: string | null;
					description: string | null;
					lat: number | null;
					lng: number | null;
					phone: string | null;
					website: string | null;
					enriched_at: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					title: string;
					note?: string | null;
					url?: string | null;
					tags?: string | null;
					comment?: string | null;
					source_list?: string | null;
					created_at?: string;
					google_place_id?: string | null;
					category?: string | null;
					primary_type?: string | null;
					rating?: number | null;
					rating_count?: number | null;
					price_level?: string | null;
					address?: string | null;
					area?: string | null;
					description?: string | null;
					lat?: number | null;
					lng?: number | null;
					phone?: string | null;
					website?: string | null;
					enriched_at?: string | null;
				};
				Update: {
					id?: string;
					user_id?: string;
					title?: string;
					note?: string | null;
					url?: string | null;
					tags?: string | null;
					comment?: string | null;
					source_list?: string | null;
					created_at?: string;
					google_place_id?: string | null;
					category?: string | null;
					primary_type?: string | null;
					rating?: number | null;
					rating_count?: number | null;
					price_level?: string | null;
					address?: string | null;
					area?: string | null;
					description?: string | null;
					lat?: number | null;
					lng?: number | null;
					phone?: string | null;
					website?: string | null;
					enriched_at?: string | null;
				};
				Relationships: [];
			};
			lists: {
				Row: {
					id: string;
					user_id: string;
					name: string;
					description: string | null;
					color: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					name: string;
					description?: string | null;
					color?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					name?: string;
					description?: string | null;
					color?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			list_places: {
				Row: {
					id: string;
					list_id: string;
					place_id: string;
					added_at: string;
				};
				Insert: {
					id?: string;
					list_id: string;
					place_id: string;
					added_at?: string;
				};
				Update: {
					id?: string;
					list_id?: string;
					place_id?: string;
					added_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'list_places_list_id_fkey';
						columns: ['list_id'];
						isOneToOne: false;
						referencedRelation: 'lists';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'list_places_place_id_fkey';
						columns: ['place_id'];
						isOneToOne: false;
						referencedRelation: 'places';
						referencedColumns: ['id'];
					}
				];
			};
		tags_table: {
			Row: {
				id: string;
				user_id: string;
				name: string;
				color: string | null;
				source: string;
				created_at: string;
				order_index: number;
			};
			Insert: {
				id?: string;
				user_id: string;
				name: string;
				color?: string | null;
				source?: string;
				created_at?: string;
				order_index?: number;
			};
			Update: {
				id?: string;
				user_id?: string;
				name?: string;
				color?: string | null;
				source?: string;
				created_at?: string;
				order_index?: number;
			};
			Relationships: [];
		};
			place_tags: {
				Row: {
					id: string;
					place_id: string;
					tag_id: string;
					created_at: string;
				};
				Insert: {
					id?: string;
					place_id: string;
					tag_id: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					place_id?: string;
					tag_id?: string;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'place_tags_place_id_fkey';
						columns: ['place_id'];
						isOneToOne: false;
						referencedRelation: 'places';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'place_tags_tag_id_fkey';
						columns: ['tag_id'];
						isOneToOne: false;
						referencedRelation: 'tags';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
}

export type Place = Database['public']['Tables']['places']['Row'];
export type PlaceInsert = Database['public']['Tables']['places']['Insert'];
export type List = Database['public']['Tables']['lists']['Row'];
export type ListInsert = Database['public']['Tables']['lists']['Insert'];
export type ListPlace = Database['public']['Tables']['list_places']['Row'];
export type Tag = Database['public']['Tables']['tags_table']['Row'];
export type TagInsert = Database['public']['Tables']['tags_table']['Insert'];
export type PlaceTag = Database['public']['Tables']['place_tags']['Row'];

export interface PlaceWithTags extends Place {
	placeTags?: Tag[];
}
