# Homebrew formula for shibaox-mem. Lives in the tap WizardingCode-io/homebrew-shibaox as
# Formula/shibaox-mem.rb; this copy is the source it is updated from on each release.
#
#   brew install wizardingcode-io/shibaox/shibaox-mem
class ShibaoxMem < Formula
  desc "Persistent memory for coding agents: one local binary, no daemon"
  homepage "https://github.com/WizardingCode-io/shibaox-mem"
  version "0.1.0"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.1.0/shibaox-mem-darwin-arm64"
      sha256 "bd741037f52cbb6c30908357614c411fb3645a064698e94668cd6cf1c9eb5569"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.1.0/shibaox-mem-darwin-x64"
      sha256 "1216db374d03670ffb19ad108fdb441557585c94e7bd12fcfcd6c5ba663e19ed"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.1.0/shibaox-mem-linux-arm64"
      sha256 "bfed1ff7f0f7b6a7fa54838f882eb52b952f9c931635daabfcb59165abe1a52b"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/shibaox-mem/releases/download/v0.1.0/shibaox-mem-linux-x64"
      sha256 "4793ee83bb20203082fe7e89e5313de69e85015b616fb00004ae012781cbd65e"
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
