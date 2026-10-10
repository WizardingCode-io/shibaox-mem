# Homebrew formula for wizardingcode-mem. Lives in the tap WizardingCode-io/homebrew-wizardingcode as
# Formula/wizardingcode-mem.rb; this copy is the source it is updated from on each release.
#
#   brew install wizardingcode-io/wizardingcode/wizardingcode-mem
class WizardingcodeMem < Formula
  desc "Persistent memory for coding agents: one local binary, no daemon"
  homepage "https://github.com/WizardingCode-io/wizardingcode-mem"
  version "0.4.3"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.3/wizardingcode-mem-darwin-arm64"
      sha256 "c28434c90f62999a8a3e9333c9bd66f15cfdce5be435d8189cc37f1cfddf81cc"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.3/wizardingcode-mem-darwin-x64"
      sha256 "3aa3a7bd3fb591732c888ee68f805a7f37c3714805af2225c9626ab1dee1ff63"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.3/wizardingcode-mem-linux-arm64"
      sha256 "c28015662a3f42f02ae32e3bc2d6dc9c96ac8d8605358fcd4129c45a1cee3a66"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.3/wizardingcode-mem-linux-x64"
      sha256 "439bb7f739dffa44b8af70d2ff37f48936a7e9067425032aa505b5508ef4df85"
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
