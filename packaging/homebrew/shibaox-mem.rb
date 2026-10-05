# Homebrew formula for shibaox-mem. Lives in the tap WizardingCode-io/homebrew-shibaox as
# Formula/shibaox-mem.rb; this copy is the source it is updated from on each release.
#
#   brew install wizardingcode-io/shibaox/shibaox-mem
class ShibaoxMem < Formula
  desc "Persistent memory for coding agents: one local binary, no daemon"
  homepage "https://github.com/WizardingCode-io/shibaox-mem"
  version "0.2.0"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.2.0/shibaox-mem-darwin-arm64"
      sha256 "3934c823eae710d305da7c44149ddb618ca70752f36a7825f796243b2d38567f"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.2.0/shibaox-mem-darwin-x64"
      sha256 "af226837f8b6d910ee3b91b9955d5ca7ed3f357faf3a1cec084a8bec0e8ae2e9"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.2.0/shibaox-mem-linux-arm64"
      sha256 "21265c6c91abf1c122a349c52a8b40717875d571867a0886e3abca992b8d5afe"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.2.0/shibaox-mem-linux-x64"
      sha256 "46018361ec3f7c61c0e279e79797f00a941e50b00ca9d1f148db518463bc7547"
    end
  end

  def install
    bin.install Dir["shibaox-mem-*"].first => "shibaox-mem"
  end

  def caveats
    <<~EOS
      Set it up for the agents on this machine:
        shibaox-mem install
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/shibaox-mem --version")
  end
end
