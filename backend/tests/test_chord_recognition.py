"""chord_recognition 核心纯函数测试（秒级回归护栏）"""
from chord_recognition import _fold_hpcp_to_12_bins, _symbol_for_hpcp_root


class TestFoldHpcpTo12Bins:
    def test_36_bins_folds_into_12(self):
        # 36 bin（每八度 3 个 bin）：连续 3 个 bin 求和折叠为 1 个音高
        frame = [0.0] * 36
        frame[0] = 1.0
        frame[1] = 2.0
        frame[2] = 3.0
        folded = _fold_hpcp_to_12_bins(frame)
        assert len(folded) == 12
        assert folded[0] == 6.0

    def test_12_bins_passthrough(self):
        frame = [0.5] * 12
        assert _fold_hpcp_to_12_bins(frame) == [0.5] * 12

    def test_non_multiple_folds_with_modulo(self):
        # 非 12 倍数（如 24-bin 的一半场景之外的任意长度）按 index % 12 累加
        frame = [1.0, 2.0, 3.0]
        folded = _fold_hpcp_to_12_bins(frame)
        assert folded[0] == 1.0
        assert folded[1] == 2.0
        assert folded[2] == 3.0
        assert sum(folded) == 6.0

    def test_empty_frame(self):
        assert _fold_hpcp_to_12_bins([]) == []


class TestSymbolForHpcpRoot:
    def test_major_chord_root_c(self):
        # HPCP 索引 root 0 = A，root 3 = C；major 模板后缀为 ""
        symbol = _symbol_for_hpcp_root(3, "major")
        assert symbol == "C"

    def test_minor_chord_root_a(self):
        # root 0 = A，minor 后缀含 "m"
        symbol = _symbol_for_hpcp_root(0, "minor")
        assert symbol == "Am"

    def test_flat_preference_when_key_is_flat(self):
        # 降号调（如 F）时 root 9（F#）应显示为 Gb 风格
        assert _symbol_for_hpcp_root(9, "major", key="F") == "Gb"
        # 升号偏好（默认/无 key）时 root 9 = F#
        assert _symbol_for_hpcp_root(9, "major") == "F#"
