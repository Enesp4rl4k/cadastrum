SELECT kaynak, kategori, COUNT(*) as adet FROM ilanlar GROUP BY kaynak, kategori LIMIT 20;
