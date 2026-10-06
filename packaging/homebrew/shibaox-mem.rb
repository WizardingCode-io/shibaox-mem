# Homebrew formula for shibaox-mem. Lives in the tap WizardingCode-io/homebrew-shibaox as
# Formula/shibaox-mem.rb; this copy is the source it is updated from on each release.
#
#   brew install wizardingcode-io/shibaox/shibaox-mem
class ShibaoxMem < Formula
  desc "Persistent memory for coding agents: one local binary, no daemon"
  homepage "https://github.com/WizardingCode-io/shibaox-mem"
  version "0.3.0"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.3.0/shibaox-mem-darwin-arm64"
      sha256 "07243b2b60302465d66854cfa0c04a14fa3fb7a9cfa6a49d80456984ded58734"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.3.0/shibaox-mem-darwin-x64"
      sha256 "94d80e2e951f3319bd1c3876669c344f239e63b3467e13a091426116343aa571"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.3.0/shibaox-mem-linux-arm64"
      sha256 "0deff1db69409b88622b1fd831233bbac41e84ca2d6523fb085d291fdce2ea46"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.3.0/shibaox-mem-linux-x64"
      sha256 "32e128401cfdc72bc474ed5b595bdfb4c34d68bd64cdd32ddd915a03358ae4c8"
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
