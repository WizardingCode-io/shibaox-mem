# Homebrew formula for shibaox-mem. Lives in the tap WizardingCode-io/homebrew-shibaox as
# Formula/shibaox-mem.rb; this copy is the source it is updated from on each release.
#
#   brew install wizardingcode-io/shibaox/shibaox-mem
class ShibaoxMem < Formula
  desc "Persistent memory for coding agents: one local binary, no daemon"
  homepage "https://github.com/WizardingCode-io/shibaox-mem"
  version "0.1.1"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.1.1/shibaox-mem-darwin-arm64"
      sha256 "a7136acaf563328addfb7a1ef3ffa63b5e7a6ae81937a742d74912ff6b05e479"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.1.1/shibaox-mem-darwin-x64"
      sha256 "fa7ff5644647c03111429f5e8fc68950f6a96d83fac5cb34b181a8bfdc8e784a"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.1.1/shibaox-mem-linux-arm64"
      sha256 "25bf7891eaa00f271745c8f74e88f778d704fec7ca6898bf8666b5e92f26bdbd"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.1.1/shibaox-mem-linux-x64"
      sha256 "a33b77cd32ae8f6b93ef074e3746c5d6a0699f2b0656bc89e1f4879b62046e10"
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
