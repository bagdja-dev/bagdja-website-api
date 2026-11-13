-- Perbaiki placeholder galeri bawaan Kumpul: data URL SVG kehilangan `>` penutup elemen <circle>
-- (`.../%3C/svg%3E` → `.../%3E%3C/svg%3E`) sehingga gambar tidak bisa dimuat di Studio maupun website.
-- Hanya menyentuh section galeri yang masih memakai placeholder rusak; foto unggahan tidak terpengaruh.
-- Idempoten: pola rusak tidak ada lagi setelah dijalankan.

UPDATE website_sections
SET content = replace(content::text, '''/%3C/svg%3E', '''/%3E%3C/svg%3E')::jsonb,
    updated_at = now()
WHERE type = 'gallery'
  AND content::text LIKE '%''/\%3C/svg\%3E%' ESCAPE '\';
