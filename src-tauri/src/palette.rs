//! Dominant-colour extraction from album artwork.
//!
//! The image is downscaled, pixels are bucketed into a coarse RGB grid, and the
//! buckets are ranked by population weighted towards saturated, mid-luminance
//! colours (near-black and near-white pixels make poor background accents).
//! Returns up to `max` distinct colours as `#rrggbb`, most dominant first.

use image::{imageops::FilterType, DynamicImage};

const BITS: u32 = 4; // 16 levels per channel -> 4096 buckets

#[derive(Default, Clone, Copy)]
struct Bucket {
    count: u32,
    r: u64,
    g: u64,
    b: u64,
}

pub fn extract(img: &DynamicImage, max: usize) -> Vec<String> {
    let small = img.resize(64, 64, FilterType::Triangle).to_rgb8();
    let mut buckets = vec![Bucket::default(); 1 << (BITS * 3)];
    for p in small.pixels() {
        let [r, g, b] = p.0;
        let shift = 8 - BITS;
        let idx = ((r as usize >> shift) << (BITS * 2)) | ((g as usize >> shift) << BITS) | (b as usize >> shift);
        let bk = &mut buckets[idx];
        bk.count += 1;
        bk.r += r as u64;
        bk.g += g as u64;
        bk.b += b as u64;
    }

    let mut scored: Vec<(f32, [u8; 3])> = buckets
        .iter()
        .filter(|b| b.count > 0)
        .map(|b| {
            let c = [
                (b.r / b.count as u64) as u8,
                (b.g / b.count as u64) as u8,
                (b.b / b.count as u64) as u8,
            ];
            let (_, s, l) = rgb_to_hsl(c);
            // Favour saturated colours that are neither too dark nor too bright.
            let lum_weight = 1.0 - ((l - 0.5).abs() * 1.6).min(0.92);
            let score = b.count as f32 * (0.35 + s) * lum_weight;
            (score, c)
        })
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut picked: Vec<[u8; 3]> = Vec::new();
    for (_, c) in &scored {
        if picked.len() >= max {
            break;
        }
        if picked.iter().all(|p| distance(*p, *c) > 48.0) {
            picked.push(*c);
        }
    }
    // Monochrome artwork: fall back to whatever is most common.
    if picked.is_empty() {
        if let Some((_, c)) = scored.first() {
            picked.push(*c);
        }
    }
    picked.into_iter().map(to_hex).collect()
}

fn distance(a: [u8; 3], b: [u8; 3]) -> f32 {
    let dr = a[0] as f32 - b[0] as f32;
    let dg = a[1] as f32 - b[1] as f32;
    let db = a[2] as f32 - b[2] as f32;
    (dr * dr + dg * dg + db * db).sqrt()
}

fn to_hex(c: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2])
}

fn rgb_to_hsl(c: [u8; 3]) -> (f32, f32, f32) {
    let r = c[0] as f32 / 255.0;
    let g = c[1] as f32 / 255.0;
    let b = c[2] as f32 / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < f32::EPSILON {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if max == r {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h / 6.0, s, l)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    #[test]
    fn picks_dominant_saturated_colour() {
        let mut img = RgbImage::from_pixel(32, 32, Rgb([20, 20, 20]));
        for y in 0..32 {
            for x in 0..20 {
                img.put_pixel(x, y, Rgb([200, 40, 60]));
            }
        }
        let out = extract(&DynamicImage::ImageRgb8(img), 4);
        assert!(!out.is_empty());
        assert!(out[0].starts_with("#c"), "expected red first, got {:?}", out);
    }

    #[test]
    fn monochrome_still_returns_a_colour() {
        let img = RgbImage::from_pixel(8, 8, Rgb([0, 0, 0]));
        let out = extract(&DynamicImage::ImageRgb8(img), 4);
        assert_eq!(out, vec!["#000000".to_string()]);
    }
}
