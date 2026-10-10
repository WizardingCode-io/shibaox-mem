# Homebrew formula for wizardingcode-mem. Lives in the tap WizardingCode-io/homebrew-wizardingcode as
# Formula/wizardingcode-mem.rb; this copy is the source it is updated from on each release.
#
#   brew install wizardingcode-io/wizardingcode/wizardingcode-mem
class WizardingcodeMem < Formula
  desc "Persistent memory for coding agents: one local binary, no daemon"
  homepage "https://github.com/WizardingCode-io/wizardingcode-mem"
  version "0.4.1"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.1/wizardingcode-mem-darwin-arm64"
      sha256 "b8863b8d9d93c067e636fc656ce1ed9895a14b54be49458a80ca3ae4e858d40a"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.1/wizardingcode-mem-darwin-x64"
      sha256 "cdf677717111bf91249d0049e4eca9f7ac1b7a649e1ed8c31d12d0733210d505"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.1/wizardingcode-mem-linux-arm64"
      sha256 "0494c1c577236052e76742b25fad3a3fc37cde153885b62911ad2d7fefb6a5b7"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.1/wizardingcode-mem-linux-x64"
      sha256 "e86f5bfe51226e91caca86d87fed84149874e643d4dfa65b11f8811a971012e8"
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
