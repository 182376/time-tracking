use serde::{Deserialize, Serialize};

pub const DEFAULT_WIDGET_ANCHOR_Y: f64 = 0.28;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WidgetSide {
    Left,
    #[default]
    Right,
}

impl WidgetSide {
    pub fn as_storage_value(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Right => "right",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
pub struct WidgetPlacement {
    pub side: WidgetSide,
    pub anchor_y: f64,
}

impl Default for WidgetPlacement {
    fn default() -> Self {
        Self {
            side: WidgetSide::Right,
            anchor_y: DEFAULT_WIDGET_ANCHOR_Y,
        }
    }
}

impl WidgetPlacement {
    pub fn new(side: WidgetSide, anchor_y: f64) -> Self {
        Self {
            side,
            anchor_y: clamp_widget_anchor_y(anchor_y),
        }
    }

    pub fn from_storage_values(side: Option<&str>, anchor_y: Option<&str>) -> Self {
        let parsed_side = side.map(parse_widget_side).unwrap_or_default();
        let parsed_anchor_y = anchor_y
            .map(parse_widget_anchor_y)
            .unwrap_or(DEFAULT_WIDGET_ANCHOR_Y);
        Self::new(parsed_side, parsed_anchor_y)
    }
}

pub fn parse_widget_side(raw: &str) -> WidgetSide {
    if raw.trim().eq_ignore_ascii_case("left") {
        WidgetSide::Left
    } else {
        WidgetSide::Right
    }
}

pub fn parse_widget_anchor_y(raw: &str) -> f64 {
    raw.trim()
        .parse::<f64>()
        .ok()
        .map(clamp_widget_anchor_y)
        .unwrap_or(DEFAULT_WIDGET_ANCHOR_Y)
}

pub fn clamp_widget_anchor_y(anchor_y: f64) -> f64 {
    if !anchor_y.is_finite() {
        return DEFAULT_WIDGET_ANCHOR_Y;
    }

    anchor_y.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::{
        clamp_widget_anchor_y, parse_widget_anchor_y, parse_widget_side, WidgetPlacement,
        WidgetSide, DEFAULT_WIDGET_ANCHOR_Y,
    };

    #[test]
    fn widget_side_parser_defaults_to_right() {
        assert_eq!(parse_widget_side("left"), WidgetSide::Left);
        assert_eq!(parse_widget_side("RIGHT"), WidgetSide::Right);
        assert_eq!(parse_widget_side("unknown"), WidgetSide::Right);
    }

    #[test]
    fn widget_anchor_y_clamps_invalid_values() {
        assert_eq!(clamp_widget_anchor_y(-1.0), 0.0);
        assert_eq!(clamp_widget_anchor_y(1.5), 1.0);
        assert_eq!(clamp_widget_anchor_y(f64::NAN), DEFAULT_WIDGET_ANCHOR_Y);
        assert_eq!(parse_widget_anchor_y("0.42"), 0.42);
        assert_eq!(parse_widget_anchor_y("nope"), DEFAULT_WIDGET_ANCHOR_Y);
    }

    #[test]
    fn widget_placement_uses_safe_defaults() {
        let defaults = WidgetPlacement::from_storage_values(None, None);
        assert_eq!(defaults.side, WidgetSide::Right);
        assert_eq!(defaults.anchor_y, DEFAULT_WIDGET_ANCHOR_Y);

        let loaded = WidgetPlacement::from_storage_values(Some("left"), Some("3.0"));
        assert_eq!(loaded.side, WidgetSide::Left);
        assert_eq!(loaded.anchor_y, 1.0);
    }
}
