{
  description = "World Heritage Register: a checkable map of UNESCO sites";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
      forAll = f: nixpkgs.lib.genAttrs systems (s: f nixpkgs.legacyPackages.${s});
    in {
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.python3 pkgs.curl pkgs.jq pkgs.nodejs ];
          shellHook = ''
            echo "rebuild data:  bash scripts/fetch_raw.sh && python3 scripts/build_data.py"
            echo "serve locally: python3 -m http.server 8000"
          '';
        };
      });
    };
}
