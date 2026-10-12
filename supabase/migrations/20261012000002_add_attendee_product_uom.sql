INSERT INTO product_uoms (code, label, symbol, sort_order)
VALUES ('ATTENDEE', 'Peserta', 'peserta', 120)
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label,
    symbol = EXCLUDED.symbol,
    is_active = TRUE,
    sort_order = EXCLUDED.sort_order;