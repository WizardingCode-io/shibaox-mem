# Homebrew formula for shibaox-mem. Lives in the tap WizardingCode-io/homebrew-shibaox as
# Formula/shibaox-mem.rb; this copy is the source it is updated from on each release.
#
#   brew install wizardingcode-io/shibaox/shibaox-mem
class ShibaoxMem < Formula
  desc "Persistent memory for coding agents: one local binary, no daemon"
  homepage "https://github.com/WizardingCode-io/shibaox-mem"
  version "0.2.1"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.2.1/shibaox-mem-darwin-arm64"
      sha256 "514a8e67e013611129e275579e76144addc8f513851cab10c9e50a3bf8a652bf"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.2.1/shibaox-mem-darwin-x64"
      sha256 "359fd50d46e73a894b66f0d93fc0d9d5e47865c5793855c59217eb3bf3427e51"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.2.1/shibaox-mem-linux-arm64"
      sha256 "19af34bf44c897ec2a3ec8fc8b83a53303b7d22a0c8fef4bbf25bdd592ceafb8"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.2.1/shibaox-mem-linux-x64"
      sha256 "7ce1a37f8468f7332402eb1589f3f15c111b81817414cd60582db5b13e090c98"
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
