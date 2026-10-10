# Homebrew formula for wizardingcode-mem. Lives in the tap WizardingCode-io/homebrew-wizardingcode as
# Formula/wizardingcode-mem.rb; this copy is the source it is updated from on each release.
#
#   brew install wizardingcode-io/wizardingcode/wizardingcode-mem
class WizardingcodeMem < Formula
  desc "Persistent memory for coding agents: one local binary, no daemon"
  homepage "https://github.com/WizardingCode-io/wizardingcode-mem"
  version "0.4.0"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.0/wizardingcode-mem-darwin-arm64"
      sha256 "ca0c0c133ba29ac755dc5bbe98471f9b82844b5896f73bd3e171ad0930ba1c98"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.0/wizardingcode-mem-darwin-x64"
      sha256 "dd7f69dcafed44a6de3f4abc2d9b4887a30aba6315f7b2599b2b90abcb5b550d"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.0/wizardingcode-mem-linux-arm64"
      sha256 "518e9afb1bc62e052e81c79fc8f9630e6377ae8fe08c678afc081fec2341cea0"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.0/wizardingcode-mem-linux-x64"
      sha256 "65a9d98fd3202773d36c938077a3bb3ac21324b8a93c16459c148446c2cc438b"
    end
  end

  def install
    bin.install Dir["wizardingcode-mem-*"].first => "wizardingcode-mem"
  end

  def caveats
    <<~EOS
      Set it up for the agents on this machine:
        wizardingcode-mem install
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/wizardingcode-mem --version")
  end
end
